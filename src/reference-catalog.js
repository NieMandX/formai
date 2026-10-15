// Original LOD0; all available material maps use source-resolution KTX2 UASTC quality 4.
export const REFERENCE_RELEASE = "reference-models-pbr-preview-v1";
export const REFERENCE_MODELS = [
  {
    "id": "reference-ariel-45",
    "name": "Ariel · поза 45",
    "file": "ariel-pose-45-uastc.glb",
    "bytes": 44576428,
    "triangles": 154218,
    "sha256": "124b3a370e6be2cb9996cb5b4dce42bce853d843193d7c82298888d2e75b49be",
    "textureSize": 8192,
    "materialVersion": 1,
    "site": "formai"
  },
  {
    "id": "reference-chloe-01",
    "name": "Chloe · поза 01",
    "file": "chloe-pose-01-uastc.glb",
    "bytes": 49099292,
    "triangles": 153838,
    "sha256": "2f15bbbc1204a07321c5b8660f51901778e1c0799be14c5222f51440fd9bd5d3",
    "textureSize": 8192,
    "materialVersion": 1,
    "site": "formai"
  },
  {
    "id": "reference-nat18-53",
    "name": "Nat I · поза 53",
    "file": "nat18-pose-53-uastc.glb",
    "bytes": 38703940,
    "triangles": 158064,
    "sha256": "38b21a043b4456f5d496ceb794d87380b13a55666396086a7e668d6d9a2f2ae9",
    "textureSize": 4096,
    "materialVersion": 1,
    "site": "formai"
  }
];

export const referenceById = (id) => REFERENCE_MODELS.find((model) => model.id === id);
export const referenceDetail = (model) => `${model.textureSize / 1024}K · максимум · ${Math.ceil(model.bytes / 1048576)} МБ`;
export const referencePath = (model, base = "./", local = false) => local || model.site === "formai"
  ? `${base}models/references/${model.file}`
  : `/${model.site}/models/references/${model.file}`;
