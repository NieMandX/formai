"""Attach source material maps to existing GLBs without recompressing their color maps.

Requires Pillow, NumPy and KTX-Software 4.4.2.
Source bundles contain JSON plus PNG maps exported from the original Unity assets.
DXT5nm is unpacked to tangent-space XYZ. The V flip in the original trimesh GLB
export reverses the bitangent, so the normal's green channel is inverted too.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import os
import json
import struct
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('base_converter', Path(__file__).with_name('convert-references.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
NORMAL_SLOTS = {'_BumpTex', '_BumpMap'}
MICRO_NORMAL_SLOTS = {'_microTex1', '_microTex3'}


def prepare_image(path, slot, kind):
    image = Image.open(path).convert('RGBA')
    if slot in NORMAL_SLOTS:
        # Work in strips to bound temporary memory for 8192-square normal maps.
        result = Image.new('RGBA', image.size)
        for y in range(0, image.height, 512):
            a = np.asarray(image.crop((0, y, image.width, min(y + 512, image.height))))
            x = a[:, :, 3].astype(np.float32) / 127.5 - 1
            ny = a[:, :, 1].astype(np.float32) / 127.5 - 1
            z = np.sqrt(np.maximum(0, 1 - x*x - ny*ny))
            n = np.stack((x, -ny, z), axis=-1)
            n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-8)
            rgba = np.empty(a.shape, np.uint8)
            rgba[:, :, :3] = np.clip(np.rint((n + 1) * 127.5), 0, 255).astype(np.uint8)
            rgba[:, :, 3] = 255
            result.paste(Image.fromarray(rgba), (0, y))
        return result
    if kind == 'skin' and slot in MICRO_NORMAL_SLOTS:
        a = np.array(image)
        a[:, :, 1] = 255 - a[:, :, 1]
        return Image.fromarray(a)
    return image


def encode_map(record, slot, kind, sources, cache, ktx, png_preview):
    normal = slot in NORMAL_SLOTS or (kind == 'skin' and slot in MICRO_NORMAL_SLOTS)
    srgb = record['colorSpace'] == 1 and not normal
    key = hashlib.sha256(f"{record['sha256']}:{srgb}:{normal}:{slot in NORMAL_SLOTS}:v1".encode()).hexdigest()
    target = cache / (key + ('.png' if png_preview else '.ktx2'))
    with (cache / (key + '.lock')).open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not target.exists():
            original = sources / 'textures' / record['file']
            assert base.digest(original.read_bytes()) == record['sha256']
            image = prepare_image(original, slot, kind)
            png = cache / (key + '.png')
            image.save(png)
            if not png_preview:
                temp = cache / (key + '.tmp.ktx2')
                command = [str(ktx), 'create', '--format', 'R8G8B8A8_SRGB' if srgb else 'R8G8B8A8_UNORM',
                           '--assign-tf', 'srgb' if srgb else 'linear', '--assign-primaries', 'bt709' if srgb else 'none',
                           '--assign-texcoord-origin', 'top-left', '--generate-mipmap', '--encode', 'uastc',
                           '--uastc-quality', '4', '--zstd', '18', '--threads', str(os.cpu_count() or 1)]
                if slot in NORMAL_SLOTS: command += ['--normalize']
                print('Encoding', slot, record['name'], record['size'], 'sRGB' if srgb else 'linear', flush=True)
                result = subprocess.run(command + [str(png), str(temp)], capture_output=True, text=True)
                (cache / (key + '.log')).write_text(result.stdout + result.stderr)
                if result.returncode: raise RuntimeError(result.stdout + result.stderr)
                subprocess.run([str(ktx), 'validate', '--gltf-basisu', str(temp)], check=True)
                temp.rename(target)
    data = target.read_bytes()
    if not png_preview:
        fields = struct.unpack_from('<9I', data, 12)
        assert list(fields[2:4]) == record['size']
        assert fields[7] == max(record['size']).bit_length() and fields[8] == 2
    return data, srgb, key


def enrich(path, sources, output, cache, ktx, png_preview=False):
    document, binary = base.read_glb(path)
    stem = path.stem.removesuffix('-uastc')
    metadata = json.loads((sources / (stem + '.json')).read_text())
    rebuilt = bytearray(binary)
    used = set(document.get('extensionsUsed', []))
    texture_cache, image_records = {}, []
    sampler = len(document.setdefault('samplers', []))
    document['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
    original_views = len(document['bufferViews'])
    mapped = 0
    for material in document['materials']:
        source = metadata['materials'][material['name']]
        if not source['textures']: continue
        kind = 'cornea' if material['name'] == 'Eyes' else ('skin' if '_BumpTex' in source['textures'] else 'detail')
        maps = {}
        for slot, record in source['textures'].items():
            data, srgb, key = encode_map(record, slot, kind, sources, cache, ktx, png_preview)
            if key not in texture_cache:
                rebuilt.extend(b'\0' * (-len(rebuilt) % 4))
                view = len(document['bufferViews'])
                document['bufferViews'].append({'buffer': 0, 'byteOffset': len(rebuilt), 'byteLength': len(data)})
                rebuilt.extend(data)
                image = len(document['images'])
                document['images'].append({'name': record['name'], 'bufferView': view, 'mimeType': 'image/png' if png_preview else 'image/ktx2'})
                texture = {'name': record['name'], 'sampler': sampler}
                if png_preview: texture['source'] = image
                else:
                    texture['extensions'] = {'KHR_texture_basisu': {'source': image}}
                    used.add('KHR_texture_basisu')
                texture_cache[key] = len(document['textures'])
                document['textures'].append(texture)
                image_records.append({'slot': slot, 'name': record['name'], 'size': record['size'], 'bytes': len(data), 'srgb': srgb, 'source_sha256': record['sha256']})
            # Source assets in this collection use identity UV transforms. Fail if
            # a future asset requires conversion rather than silently misaligning it.
            assert record['scale'] == [1, 1] and record['offset'] == [0, 0], (stem, slot, record)
            maps[slot] = texture_cache[key]
        native = material.setdefault('pbrMetallicRoughness', {})
        native['metallicFactor'] = 0
        if kind in ('skin', 'cornea'):
            material['normalTexture'] = {'index': maps['_BumpTex' if kind == 'skin' else '_BumpMap'], 'scale': min(2, source['floats'].get('_normalStrength', 1))}
            material.setdefault('extensions', {})['KHR_materials_specular'] = {
                'specularColorTexture': {'index': maps['_SpecTex']},
                'specularColorFactor': source['colors'].get('_SpecColor', [1, 1, 1])[:3],
            }
            used.add('KHR_materials_specular')
            if kind == 'cornea':
                native['roughnessFactor'] = .16
                material['alphaMode'] = 'BLEND'
                material.setdefault('extras', {})['formaiTransparentEyeOverlay'] = True
            else:
                material['occlusionTexture'] = {'index': maps['_OcclusionTex'], 'strength': min(1, source['colors'].get('_components', [1])[0])}
                if '_velvetMask' in maps:
                    material['extensions']['KHR_materials_sheen'] = {'sheenColorFactor': [.15, .15, .15], 'sheenColorTexture': {'index': maps['_velvetMask']}, 'sheenRoughnessFactor': .8}
                    used.add('KHR_materials_sheen')
        material.setdefault('extras', {})['formaiMaterial'] = {'version': 1, 'kind': kind, 'maps': maps, 'floats': source['floats'], 'colors': source['colors']}
        mapped += 1
    document['extensionsUsed'] = sorted(used)
    if not png_preview:
        document['extensionsRequired'] = sorted(set(document.get('extensionsRequired', []) + ['KHR_texture_basisu']))
    document['buffers'][0]['byteLength'] = len(rebuilt)
    document['asset']['generator'] += ' / FORMAI source PBR maps v1'
    encoded_json = json.dumps(document, separators=(',', ':')).encode()
    encoded_json += b' ' * (-len(encoded_json) % 4)
    rebuilt.extend(b'\0' * (-len(rebuilt) % 4))
    glb = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded_json) + len(rebuilt)) + struct.pack('<I4s', len(encoded_json), b'JSON') + encoded_json + struct.pack('<I4s', len(rebuilt), b'BIN\0') + rebuilt)
    target = output / (stem + ('-pbr-preview.glb' if png_preview else '-uastc.glb'))
    target.write_bytes(glb)
    check, data = base.read_glb(target)
    original, original_binary = base.read_glb(path)
    for i in range(original_views):
        assert base.view_bytes(check, data, i) == base.view_bytes(original, original_binary, i), 'Existing geometry/color texture changed'
    for key in ('accessors', 'meshes', 'nodes', 'scenes'):
        assert check.get(key) == original.get(key)
    report_path = path.with_suffix('.json')
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    report.update({'file': target.name, 'bytes': len(glb), 'sha256': base.digest(glb), 'materialVersion': 1, 'mappedMaterials': mapped, 'additionalImages': image_records})
    target.with_suffix('.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ('file', 'bytes', 'mappedMaterials', 'sha256')}), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache', type=Path, default=Path('local-models/material-ktx2-cache'))
    parser.add_argument('--ktx', type=Path)
    parser.add_argument('--preview-png', action='store_true')
    args = parser.parse_args()
    assert args.preview_png or args.ktx
    args.output.mkdir(parents=True, exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)
    for path in args.files:
        enrich(path, args.sources, args.output, args.cache, args.ktx, args.preview_png)
