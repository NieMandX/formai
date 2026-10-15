"""Keep every pose available while replacing individual assets with finished PBR GLBs."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_BUDGET = 850 * 1024**2
PBR_RELEASE = 'reference-models-pbr-preview-v1'


def build(published_path):
    published = set(json.loads(published_path.read_text()))
    sources = json.loads((ROOT / 'scripts/reference-sources.json').read_text())['models']
    families = {'ariel': 'Ariel', 'chloe': 'Chloe', 'nat18': 'Nat I', 'nat21': 'Nat II', 'lucid': 'Lucid II'}
    models, local_files = [], {}
    for source in sources:
        stem = Path(source['file']).stem
        family, pose = stem.split('-pose-')
        compressed = stem + '-uastc.glb'
        pbr = ROOT / 'local-models/references-pbr' / compressed
        base = ROOT / 'local-models/full-collection-ktx2' / compressed
        if compressed in published:
            path, release, version = pbr, PBR_RELEASE, 1
            report = json.loads(path.with_suffix('.json').read_text())
        elif base.exists() and base.with_suffix('.json').exists():
            path, release, version = base, 'reference-models-uastc-v2', 0
            report = json.loads(path.with_suffix('.json').read_text())
        else:
            path, release, version = ROOT / 'local-models/all-references-max' / source['file'], 'reference-sources-v2', 0
            original = json.loads(path.with_suffix('.json').read_text())
            report = {'file': path.name, 'bytes': original['size_bytes'], 'sha256': source['sha256'],
                      'textureSize': max(max(t['export_size']) for t in original['textures']), 'triangles': original['triangles']}
        assert path.stat().st_size == report['bytes']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == report['sha256']
        assert report['textureSize'] in (4096, 8192) and 0 < report['bytes'] < 250 * 1024**2
        item = {'id': f'reference-{family}-{pose}', 'name': f'{families[family]} · поза {pose.replace("nat-", "Nat ")}',
                **{k: report[k] for k in ('file', 'bytes', 'triangles', 'sha256', 'textureSize')},
                'release': release, 'materialVersion': version, 'textureEncoding': 'KTX2 UASTC' if compressed == path.name else 'PNG'}
        models.append(item)
        local_files[item['file']] = path
    assert len(models) == 43 and len({m['id'] for m in models}) == 43
    catalogue = ROOT / 'src/reference-catalog.js'
    match = re.search(r'export const REFERENCE_MODELS = (\[.*?\]);', catalogue.read_text(), re.S)
    previous = {m['id']: m for m in json.loads(match.group(1))} if match else {}
    bins = {}
    # Preserve unchanged asset locations. Move only replacements that no longer
    # fit within a site's verified budget.
    order = sorted(models, key=lambda m: (previous.get(m['id'], {}).get('sha256') != m['sha256'], -m['bytes']))
    for m in order:
        preferred = previous.get(m['id'], {}).get('site', 'formai')
        if bins.get(preferred, 0) + m['bytes'] <= SITE_BUDGET:
            site = preferred
        else:
            index = 0
            while True:
                site = 'formai' if index == 0 else f'formai-library-{index}'
                if bins.get(site, 0) + m['bytes'] <= SITE_BUDGET: break
                index += 1
        bins[site] = bins.get(site, 0) + m['bytes']
        m['site'] = site
    models.sort(key=lambda m: (list(families).index(m['id'].split('-')[1]), int(m['id'].split('-')[-1])))
    code = ('// Original LOD0 poses; upgrade each asset independently when PBR conversion is complete.\n'
            f'export const REFERENCE_RELEASE = "{PBR_RELEASE}";\n'
            'export const REFERENCE_MODELS = ' + json.dumps(models, ensure_ascii=False, indent=2) + ';\n\n'
            'export const referenceById = (id) => REFERENCE_MODELS.find((model) => model.id === id);\n'
            'export const referenceDetail = (model) => `${model.textureSize / 1024}K · максимум · ${Math.ceil(model.bytes / 1048576)} МБ`;\n'
            'export const referencePath = (model, base = "./", local = false) => local || model.site === "formai"\n'
            '  ? `${base}models/references/${model.file}`\n'
            '  : `/${model.site}/models/references/${model.file}`;\n')
    catalogue.write_text(code)
    staging = ROOT / 'local-models/reference-sites'
    for site, size in sorted(bins.items()):
        directory = staging / site
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'reference-assets.json').write_text(json.dumps({'release': PBR_RELEASE, 'models': [m for m in models if m['site'] == site]}, indent=2))
        if site != 'formai':
            shutil.copyfile(ROOT / 'scripts/prepare-reference-site.mjs', directory / 'prepare-reference-site.mjs')
            (directory / '.github/workflows').mkdir(parents=True, exist_ok=True)
            shutil.copyfile(staging / 'pages-template.yml', directory / '.github/workflows/pages.yml')
            (directory / 'README.md').write_text('# FORMAI model library\n\nVerified assets for https://niemandx.github.io/formai/. Original LOD0 and source texture resolution.\n')
    (staging / 'local-files.json').write_text(json.dumps({name: str(path) for name, path in local_files.items()}, indent=2))
    print(json.dumps({'models': len(models), 'complete_pbr': sum(m['materialVersion'] == 1 for m in models), 'site_bytes': bins}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('published_pbr_files', type=Path, help='JSON filenames verified as uploaded to the PBR release')
    build(parser.parse_args().published_pbr_files)
