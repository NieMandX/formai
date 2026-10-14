"""Convert embedded color PNGs to 8K-preserving KTX2; requires Pillow and KTX 4.4.2.

Geometry buffer views are copied byte for byte. Original GLBs are never modified.
Example: python convert-references.py --ktx /path/to/ktx --output local-models/artist-references-ktx2 local-models/artist-references-max/*.glb
"""
import argparse
import fcntl
import hashlib
import io
import json
import struct
import subprocess
import time
from pathlib import Path

from PIL import Image


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    data = path.read_bytes()
    assert data[:4] == b"glTF" and struct.unpack_from("<I", data, 4)[0] == 2
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + length])
    assert data[24 + length:28 + length] == b"BIN\0"
    return document, data[28 + length:]


def view_bytes(document, binary, index):
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def convert(path, output, cache, ktx):
    document, binary = read_glb(path)
    replacements, transparent_images, image_records = {}, set(), []
    for index, image in enumerate(document["images"]):
        assert image["mimeType"] == "image/png", "Expected original embedded PNGs"
        original = view_bytes(document, binary, image["bufferView"])
        with Image.open(io.BytesIO(original)) as decoded:
            width, height = decoded.size
            transparent = decoded.mode == "RGBA" and decoded.getextrema() == ((0, 0),) * 4
        if transparent:
            transparent_images.add(index)
        key = digest(original)
        png, target = cache / (key + ".png"), cache / (key + ".ktx2")
        log = cache / (key + ".log")
        with (cache / (key + ".lock")).open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if not target.exists():
                png.write_bytes(original)
                temporary = cache / (key + ".tmp.ktx2")
                command = [str(ktx), "create", "--format", "R8G8B8A8_SRGB",
                           "--assign-tf", "srgb", "--assign-primaries", "bt709",
                           "--assign-texcoord-origin", "top-left", "--generate-mipmap",
                           "--encode", "uastc", "--uastc-quality", "4",
                           "--zstd", "18", "--threads", "6", "--compare-psnr",
                           str(png), str(temporary)]
                print(f"Encoding {path.name}: {width}x{height}, UASTC quality 4, no RDO", flush=True)
                started = time.monotonic()
                result = subprocess.run(command, capture_output=True, text=True)
                log.write_text(result.stdout + result.stderr)
                if result.returncode:
                    raise RuntimeError(log.read_text())
                subprocess.run([str(ktx), "validate", "--gltf-basisu", str(temporary)], check=True)
                temporary.rename(target)
                print(f"Encoded in {time.monotonic() - started:.1f}s: {target.stat().st_size / 2**20:.2f} MiB", flush=True)
        encoded = target.read_bytes()
        assert encoded[:12] == b"\xabKTX 20\xbb\r\n\x1a\n"
        fields = struct.unpack_from("<9I", encoded, 12)
        assert fields[2:4] == (width, height), "Texture resolution changed"
        assert fields[8] == 2, "Expected Zstandard supercompression"
        assert fields[7] == max(width, height).bit_length(), "Missing mipmaps"
        replacements[image["bufferView"]] = encoded
        image["mimeType"] = "image/ktx2"
        image_records.append({"size": [width, height], "levels": fields[7],
                              "png_bytes": len(original), "ktx2_bytes": len(encoded),
                              "source_sha256": key, "log": str(log)})

    for material in document["materials"]:
        texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if material.get("name") == "Eyes" and texture:
            source = document["textures"][texture["index"]]["source"]
            if source in transparent_images:
                material["alphaMode"] = "BLEND"
                material.pop("alphaCutoff", None)
                material.setdefault("extras", {})["formaiTransparentEyeOverlay"] = True
    for texture in document["textures"]:
        texture.setdefault("extensions", {})["KHR_texture_basisu"] = {"source": texture.pop("source")}
    for key in ["extensionsUsed", "extensionsRequired"]:
        document[key] = sorted(set(document.get(key, []) + ["KHR_texture_basisu"]))

    rebuilt = bytearray()
    geometry_hashes = []
    for index, view in enumerate(document["bufferViews"]):
        original = view_bytes(document, binary, index)
        data = replacements.get(index, original)
        rebuilt.extend(b"\0" * (-len(rebuilt) % 4))
        view["byteOffset"], view["byteLength"] = len(rebuilt), len(data)
        rebuilt.extend(data)
        if index not in replacements:
            geometry_hashes.append(digest(data))
    document["buffers"][0]["byteLength"] = len(rebuilt)
    document["asset"]["generator"] = "FORMAI / KTX-Software 4.4.2 / UASTC quality 4 + Zstd 18 / no RDO"
    encoded_json = json.dumps(document, separators=(",", ":")).encode()
    encoded_json += b" " * (-len(encoded_json) % 4)
    rebuilt.extend(b"\0" * (-len(rebuilt) % 4))
    glb = (struct.pack("<4sII", b"glTF", 2, 28 + len(encoded_json) + len(rebuilt))
           + struct.pack("<I4s", len(encoded_json), b"JSON") + encoded_json
           + struct.pack("<I4s", len(rebuilt), b"BIN\0") + rebuilt)
    filename = path.stem + "-uastc.glb"
    destination = output / filename
    destination.write_bytes(glb)
    check, check_binary = read_glb(destination)
    original_doc, original_bin = read_glb(path)
    for index in range(len(check["bufferViews"])):
        if index not in replacements:
            assert view_bytes(check, check_binary, index) == view_bytes(original_doc, original_bin, index)
    for key in ["accessors", "meshes", "nodes", "scenes"]:
        assert check.get(key) == original_doc.get(key), f"Geometry structure changed: {key}"
    triangles = sum(original_doc["accessors"][p["indices"]]["count"] // 3
                    for mesh in original_doc["meshes"] for p in mesh["primitives"])
    record = {"file": filename, "source": str(path), "source_bytes": path.stat().st_size,
              "bytes": len(glb), "sha256": digest(glb), "triangles": triangles,
              "textureSize": max(r["size"][0] for r in image_records),
              "textureEncoding": "KTX2 UASTC + Zstd", "images": image_records,
              "geometry_sha256": geometry_hashes}
    destination.with_suffix(".json").write_text(json.dumps(record, indent=2))
    print(json.dumps({k: record[k] for k in ["file", "bytes", "triangles", "sha256"]}), flush=True)
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--ktx", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cache", type=Path, default=Path("local-models/ktx2-cache"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)
    for source in args.files:
        convert(source, args.output, args.cache, args.ktx)
