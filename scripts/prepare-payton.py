"""Preserve Payton's OBJ geometry and source texture sizes in KTX2 GLBs.

Requires numpy and official KTX-Software 4.4.2. Outputs and progress are resumable;
source files are never changed. No network or publishing occurs in this script.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import time

import numpy as np


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def save_json(path, value):
    tmp = path.with_suffix('.tmp.json')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def read_obj(path):
    positions, normals, uvs, groups = [], [], [], {}
    material = None
    for line in path.open():
        p = line.split()
        if not p:
            continue
        if p[0] == 'v':
            positions.append(tuple(map(float, p[1:4])))
        elif p[0] == 'vn':
            normals.append(tuple(map(float, p[1:4])))
        elif p[0] == 'vt':
            uvs.append(tuple(map(float, p[1:3])))
        elif p[0] == 'usemtl':
            material = p[1]
            groups.setdefault(material, [])
        elif p[0] == 'f':
            assert len(p) == 4 and material in groups, 'Expected source triangles and named materials'
            groups[material].append([tuple(int(x) - 1 for x in vertex.split('/')) for vertex in p[1:]])
    assert set(groups) == {'_Body:defaultMat', '_COuch:defaultMat'}
    assert sum(map(len, groups.values())) == 299998
    parts = []
    for source_name, name in [('_Body:defaultMat', 'Payton · Body'), ('_COuch:defaultMat', 'Payton · Couch')]:
        vertices, index, indices = [], {}, []
        for face in groups[source_name]:
            for key in face:
                if key not in index:
                    index[key] = len(vertices)
                    vertices.append(key)
                indices.append(index[key])
        p = np.asarray([positions[v] for v, t, n in vertices], dtype='<f4')
        n = np.asarray([normals[n] for v, t, n in vertices], dtype='<f4')
        uv = np.asarray([(uvs[t][0], 1 - uvs[t][1]) for v, t, n in vertices], dtype='<f4')
        ix = np.asarray(indices, dtype='<u4')
        # Verify every exported corner against the source, including winding and seams.
        corners = np.asarray([key for face in groups[source_name] for key in face])
        assert np.array_equal(p[ix], np.asarray(positions, dtype='<f4')[corners[:, 0]])
        assert np.array_equal(n[ix], np.asarray(normals, dtype='<f4')[corners[:, 2]])
        source_uv = np.asarray(uvs)[corners[:, 1]]
        source_uv[:, 1] = 1 - source_uv[:, 1]
        assert np.array_equal(uv[ix], source_uv.astype('<f4'))
        parts.append({'name': name, 'positions': p, 'normals': n, 'uv': uv, 'indices': ix})
    return parts


def ktx_info(path, size):
    with path.open('rb') as f:
        header = f.read(80)
    assert header[:12] == b'\xabKTX 20\xbb\r\n\x1a\n'
    fields = struct.unpack_from('<9I', header, 12)
    assert fields[2:4] == (size, size), 'Resolution changed'
    assert fields[7] == size.bit_length(), 'Incomplete mip chain'
    assert fields[8] == 2, 'Expected Zstd'
    return {'size': size, 'levels': fields[7], 'bytes': path.stat().st_size, 'sha256': sha(path)}


def encode(source, output, ktx, size, threads, state, progress):
    target = output / (source.stem + '.ktx2')
    digest = sha(source)
    old = state['textures'].get(source.name, {})
    if target.exists() and old.get('sourceSha256') == digest and old.get('status') == 'complete':
        info = ktx_info(target, size)
        assert info['sha256'] == old['sha256']
        return target
    record = {'sourceSha256': digest, 'size': size, 'status': 'encoding', 'startedAt': time.time()}
    state['textures'][source.name] = record
    save_json(progress, state)
    temporary = target.with_suffix('.tmp.ktx2')
    command = [str(ktx), 'create', '--format', 'R8G8B8A8_SRGB', '--assign-tf', 'srgb',
               '--assign-primaries', 'bt709', '--assign-texcoord-origin', 'top-left', '--generate-mipmap',
               '--encode', 'uastc', '--uastc-quality', '4', '--zstd', '18', '--threads', str(threads),
               '--compare-psnr', str(source), str(temporary)]
    print(f'Encoding {source.name}: {size}², UASTC 4, Zstd 18, {threads} threads, no resize / RDO', flush=True)
    with target.with_suffix('.log').open('w') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    subprocess.run([str(ktx), 'validate', '--gltf-basisu', str(temporary)], check=True)
    info = ktx_info(temporary, size)
    temporary.replace(target)
    record.update(info, status='complete', seconds=round(time.time() - record['startedAt'], 2))
    save_json(progress, state)
    print(f'Completed {source.name}: {info["bytes"] / 1048576:.2f} MiB in {record["seconds"]} s', flush=True)
    return target


def assemble(parts, body, couch, output, source_sha, texture_size):
    compressed = body.suffix == '.ktx2'
    assert compressed == (couch.suffix == '.ktx2')
    binary = bytearray()
    doc = {'asset': {'version': '2.0', 'generator': 'FORMAI / source OBJ + ' + ('KTX-Software 4.4.2 / UASTC Q4 Zstd18 no RDO' if compressed else 'PNG preview'),
                     'copyright': 'Dreamlight AB 2022. All rights reserved.'},
           'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'Payton129', 'mesh': 0}],
           'meshes': [{'name': 'Payton129', 'primitives': []}], 'accessors': [], 'bufferViews': [],
           'images': [], 'textures': [], 'materials': [],
           'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
           'extensionsUsed': ['KHR_texture_basisu'], 'extensionsRequired': ['KHR_texture_basisu'],
           'extras': {'formaiSourceObjSha256': source_sha, 'formaiSourceTriangles': 299998,
                      'formaiBodyResolution': texture_size, 'formaiCouchResolution': 8192}}
    def view(data, target=None):
        binary.extend(b'\0' * (-len(binary) % 4))
        item = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
        if target:
            item['target'] = target
        doc['bufferViews'].append(item)
        binary.extend(data)
        return len(doc['bufferViews']) - 1
    def accessor(data, kind, component, target):
        item = {'bufferView': view(data.tobytes(), target), 'componentType': component, 'count': len(data), 'type': kind}
        if kind == 'VEC3':
            item.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        doc['accessors'].append(item)
        return len(doc['accessors']) - 1
    geometry_hashes = []
    for i, part in enumerate(parts):
        attrs = {key: accessor(part[value], kind, 5126, 34962) for key, value, kind in [
            ('POSITION', 'positions', 'VEC3'), ('NORMAL', 'normals', 'VEC3'), ('TEXCOORD_0', 'uv', 'VEC2')]}
        idx = accessor(part['indices'], 'SCALAR', 5125, 34963)
        doc['meshes'][0]['primitives'].append({'attributes': attrs, 'indices': idx, 'material': i, 'mode': 4})
        for key in ['positions', 'normals', 'uv', 'indices']:
            geometry_hashes.append(hashlib.sha256(part[key].tobytes()).hexdigest())
        doc['materials'].append({'name': part['name'], 'alphaMode': 'OPAQUE', 'doubleSided': False,
            'pbrMetallicRoughness': {'baseColorTexture': {'index': i}, 'metallicFactor': 0, 'roughnessFactor': .65 if i == 0 else .82}})
    for i, path in enumerate([body, couch]):
        doc['images'].append({'name': path.stem, 'mimeType': 'image/ktx2' if compressed else 'image/png', 'bufferView': view(path.read_bytes())})
        doc['textures'].append({'sampler': 0, **({'extensions': {'KHR_texture_basisu': {'source': i}}} if compressed else {'source': i})})
    if not compressed:
        del doc['extensionsUsed'], doc['extensionsRequired']
    doc['buffers'] = [{'byteLength': len(binary)}]
    payload = json.dumps(doc, separators=(',', ':')).encode()
    payload += b' ' * (-len(payload) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    data = (struct.pack('<4sII', b'glTF', 2, 28 + len(payload) + len(binary)) +
            struct.pack('<I4s', len(payload), b'JSON') + payload + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    path = output / f'payton-129-{texture_size // 1024}k-{"uastc" if compressed else "preview"}.glb'
    tmp = path.with_suffix('.tmp.glb')
    tmp.write_bytes(data)
    tmp.replace(path)
    result = {'file': path.name, 'bytes': len(data), 'sha256': sha(path), 'triangles': 299998,
              'textureSize': texture_size, 'couchTextureSize': 8192, 'geometrySha256': geometry_hashes,
              'sourceObjSha256': source_sha, 'materials': [p['name'] for p in parts]}
    save_json(path.with_suffix('.json'), result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('local-models/payton129'))
    parser.add_argument('--ktx', type=Path, required=True)
    parser.add_argument('--threads', type=int, default=os.cpu_count() or 1)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with (args.output / 'conversion.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        progress = args.output / 'conversion-progress.json'
        state = json.loads(progress.read_text()) if progress.exists() else {'textures': {}}
        state.update(status='running', pid=os.getpid(), quality={'uastc': 4, 'zstd': 18, 'rdo': False, 'resize': False, 'fullMipChain': True})
        save_json(progress, state)
        try:
            parts = read_obj(args.source / 'Payton129.obj')
            textures = {}
            for name, size in [('Body_Diffuse_16k', 16384), ('Couch_Diffuse_8k', 8192), ('Body_Diffuse_8k', 8192)]:
                textures[name] = encode(args.source / ('Payton129_' + name + '.png'), args.output, args.ktx, size, args.threads, state, progress)
            source_sha = sha(args.source / 'Payton129.obj')
            models = [assemble(parts, textures[f'Body_Diffuse_{k}k'], textures['Couch_Diffuse_8k'], args.output, source_sha, k * 1024) for k in [16, 8]]
            assert models[0]['geometrySha256'] == models[1]['geometrySha256']
            state.update(status='complete', models=models, completedAt=time.time())
            save_json(progress, state)
            print(json.dumps(models), flush=True)
        except Exception as e:
            state.update(status='error', error=str(e))
            save_json(progress, state)
            raise


if __name__ == '__main__':
    main()
