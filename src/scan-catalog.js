// Source mesh scans. Texture variants keep exactly the same geometry.
export const SCAN_CANDIDATES = [{
  id: "scan-payton-129",
  name: "Payton · поза 129",
  sourceFolder: "Dreamlight_HotGirlsHDScans_Payton129_OBJ",
  format: "GLB",
  subtitle: "16K тело · 8K диван · KTX2",
  triangles: 299998,
  published: false,
  variants: [],
}];
// Never advertise an unfinished conversion or a file that has not been published.
export const SCAN_MODELS = SCAN_CANDIDATES.filter(model => model.published && model.variants.length);
export const scanById = id => SCAN_MODELS.find(model => model.id === id);
export function selectScanAsset(model, maxTextureSize) {
  const variants = [...model.variants].sort((a, b) => b.textureSize - a.textureSize);
  const variant = variants.find(v => v.textureSize <= maxTextureSize);
  if (!variant) throw new Error("Для этой модели нужна поддержка текстур не менее 8K.");
  return { ...model, ...variant };
}
export const scanPath = (asset, base = "./", local = false) => local
  ? `${base}models/scans/${asset.file}`
  : asset.url;
export const scanDetail = model => `${model.textureSize / 1024}K тело · 8K диван · KTX2`;
