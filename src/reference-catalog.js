// Original LOD0 geometry and embedded 8K PNG textures. No runtime downsampling.
export const REFERENCE_RELEASE = "reference-models-v1";
export const REFERENCE_MODELS = [
  {
    "id": "reference-ariel-42",
    "name": "Ariel · поза 42",
    "file": "ariel-pose-42.glb",
    "bytes": 36089856,
    "triangles": 152926,
    "sha256": "3b8f900e7178b5effbb1082da1bad0ec863f37d13d1732d3ffdb147b66623846",
    "textureSize": 8192
  },
  {
    "id": "reference-ariel-57",
    "name": "Ariel · поза 57",
    "file": "ariel-pose-57.glb",
    "bytes": 34603720,
    "triangles": 122854,
    "sha256": "4a0c2d04c7efbbc1cb1716d3e06178aeed478142523705063a9d1d580f02fbba",
    "textureSize": 8192
  },
  {
    "id": "reference-ariel-74",
    "name": "Ariel · поза 74",
    "file": "ariel-pose-74.glb",
    "bytes": 36715120,
    "triangles": 124228,
    "sha256": "b00e88969da07202bc1876369b5f9a9f8e32e1d52709bb55097ea7bc7ead33e8",
    "textureSize": 8192
  },
  {
    "id": "reference-chloe-01",
    "name": "Chloe · поза 01",
    "file": "chloe-pose-01.glb",
    "bytes": 42441424,
    "triangles": 153838,
    "sha256": "9e83616e00ab0976e58e0582d9996f11375831ce14dc3e59e5c58c6c44d59df5",
    "textureSize": 8192
  },
  {
    "id": "reference-chloe-06",
    "name": "Chloe · поза 06",
    "file": "chloe-pose-06.glb",
    "bytes": 42584412,
    "triangles": 152374,
    "sha256": "dd896d29360e260fbd01d033acfee6549680a8a2ad6f7f97105193175a94d483",
    "textureSize": 8192
  },
  {
    "id": "reference-chloe-12",
    "name": "Chloe · поза 12",
    "file": "chloe-pose-12.glb",
    "bytes": 40376304,
    "triangles": 152572,
    "sha256": "750e0de9e29ddd7f71426301ec86e6945cb839fb21ad6b1527c77a1982a83321",
    "textureSize": 8192
  }
];

export const referenceById = (id) => REFERENCE_MODELS.find((model) => model.id === id);
export const referenceDetail = (model) => `8K · максимум · ${Math.ceil(model.bytes / 1048576)} МБ`;
