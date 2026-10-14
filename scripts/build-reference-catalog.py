"""Build the site catalogue from verified conversion reports, without resizing assets."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_BUDGET = 850 * 1024**2


def build(report_path):
    reports = json.loads(report_path.read_text())
    sources = json.loads((ROOT / 'scripts/reference-sources.json').read_text())['models']
    expected = {Path(m['file']).stem + '-uastc.glb' for m in sources}
    assert len(reports) == len(expected) == 43
    assert {r['file'] for r in reports} == expected
    families = {'ariel': 'Ariel', 'chloe': 'Chloe', 'nat18': 'Nat I',
                'nat21': 'Nat II', 'lucid': 'Lucid II'}
    models = []
    for report in reports:
        family, pose = report['file'].removesuffix('-uastc.glb').split('-pose-')
        assert report['textureSize'] in (4096, 8192)
        assert 0 < report['bytes'] < 100 * 1024**2
        assert len(report['sha256']) == 64
        models.append({
            'id': f'reference-{family}-{pose}',
            'name': f'{families[family]} · поза {pose.replace("nat-", "Nat ")}',
            **{key: report[key] for key in ['file', 'bytes', 'triangles', 'sha256', 'textureSize']},
        })
    models.sort(key=lambda m: (list(families).index(m['file'].split('-pose-')[0]),
                              int(m['file'].split('-pose-')[1].removesuffix('-uastc.glb').replace('nat-', ''))))
    # Each published Pages site stays comfortably below GitHub's 1 GB limit.
    bins = []
    for model in sorted(models, key=lambda m: -m['bytes']):
        index = next((i for i, size in enumerate(bins) if size + model['bytes'] <= SITE_BUDGET), len(bins))
        if index == len(bins):
            bins.append(0)
        bins[index] += model['bytes']
        model['site'] = 'formai' if index == 0 else f'formai-library-{index}'
    code = ('// Generated from verified UASTC reports. Original LOD0 and source resolution.\n'
            'export const REFERENCE_RELEASE = "reference-models-uastc-v2";\n'
            'export const REFERENCE_MODELS = ' + json.dumps(models, ensure_ascii=False, indent=2) + ';\n\n'
            'export const referenceById = (id) => REFERENCE_MODELS.find((model) => model.id === id);\n'
            'export const referenceDetail = (model) => `${model.textureSize / 1024}K · максимум · ${Math.ceil(model.bytes / 1048576)} МБ`;\n'
            'export const referencePath = (model, base = "./", local = false) => local || model.site === "formai"\n'
            '  ? `${base}models/references/${model.file}`\n'
            '  : `/${model.site}/models/references/${model.file}`;\n')
    (ROOT / 'src/reference-catalog.js').write_text(code)
    staging = ROOT / 'local-models/reference-sites'
    for i in range(1, len(bins)):
        name = f'formai-library-{i}'
        directory = staging / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'reference-assets.json').write_text(json.dumps({
            'release': 'reference-models-uastc-v2',
            'models': [m for m in models if m['site'] == name],
        }, indent=2))
    print(json.dumps({'models': len(models), 'total_bytes': sum(bins), 'site_bytes': bins}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reports', type=Path)
    build(parser.parse_args().reports)
