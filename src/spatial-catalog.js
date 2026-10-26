export const SPATIAL_MODELS = [{
  id: "spatial-ariel-cream-024",
  name: "Ariel · Cream Outfit 024",
  sourceFolder: "vrgirlz ariel cream outfit 024 spatial model",
  folderId: "art/spatial",
  file: "Ariel-Cream-Outfit-024.ply",
  format: "PLY · 3DGS",
  subtitle: "508 670 сплатов · исходное качество · 120 МБ",
  bytes: 126151691,
  splats: 508670,
  sha256: "9a04ffce689d22c321e18135a1f1edfcce512de08edc13f1db99ba59bdb576b8",
  release: "reference-models-pbr-preview-v1",
}, ...[
  ["026", 560004, 138882523, "7a7d4bf7eb1ce5a7cc91c83b60554281166d85057ea5b8f94e583e4fcb4848f1"],
  ["028", 520590, 129107851, "21441c24fa19981bceadda8ebc07f7ab6103d4cba63f4f04bfbac217fcbf42e5"],
  ["031", 592947, 147052387, "ef23597226f874b0e2171dac56326bcafdc99387c51230cd1e8adb531af5e2ff"],
].map(([pose, splats, bytes, sha256]) => ({
  id: `spatial-ariel-blue-${pose}`,
  name: `Ariel · Blue Swim ${pose}`,
  sourceFolder: `vrgirlz ariel blue yoga ${pose} spatial model`,
  folderId: `art/spatial-ariel-blue-${pose}`,
  file: `Ariel-Blue-Swim-${pose}.ply`,
  url: `https://formai-models.s3.cloud.ru/spatial/Ariel-Blue-Swim-${pose}.ply`,
  format: "PLY · 3DGS", splats, bytes, sha256,
  subtitle: `${splats.toLocaleString("ru-RU")} сплатов · исходное качество · ${Math.round(bytes / 1048576)} МБ`,
}))];
export const spatialById = id => SPATIAL_MODELS.find(m => m.id === id);
export const spatialPath = (model, base = "./") => model.url || `${base}models/spatial/${model.file}`;
