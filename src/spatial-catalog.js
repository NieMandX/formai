export const SPATIAL_MODELS = [{
  id: "spatial-ariel-cream-024",
  name: "Ariel · Cream Outfit 024",
  file: "Ariel-Cream-Outfit-024.ply",
  format: "PLY · 3DGS",
  subtitle: "508 670 сплатов · исходное качество · 120 МБ",
  bytes: 126151691,
  splats: 508670,
  sha256: "9a04ffce689d22c321e18135a1f1edfcce512de08edc13f1db99ba59bdb576b8",
  release: "reference-models-pbr-preview-v1",
}];
export const spatialById = id => SPATIAL_MODELS.find(m => m.id === id);
export const spatialPath = (model, base = "./") => `${base}models/spatial/${model.file}`;
