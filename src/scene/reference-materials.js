// The original scans use a transparent Marmoset corneal overlay. The first
// conversion exported its empty RGBA texture as OPAQUE, covering the real eyes.
// Repair only that legacy signature, including copies restored from IndexedDB.
export function restoreReferenceEyeTransparency(root, readPixels = texturePixels) {
  const inspected = new Map();
  let repaired = 0;
  root.traverse((mesh) => {
    if (!mesh.isMesh || !/^Eyes-(Clear-)?(Left|Right)_LOD\d+_\d+$/.test(mesh.name)) return;
    const material = mesh.material;
    if (!material?.isMeshStandardMaterial || material.name !== "Eyes") return;
    if (!inspected.has(material)) {
      const image = material.map?.image;
      let empty = false;
      if (image?.width === 256 && image.height === 256) {
        try {
          const pixels = readPixels(image);
          empty = pixels.length === 256 * 256 * 4 && pixels.every((value) => value === 0);
        } catch {
          // An unreadable external texture must not change an imported material.
        }
      }
      inspected.set(material, empty);
    }
    if (!inspected.get(material)) return;
    material.transparent = true;
    material.depthWrite = false;
    material.needsUpdate = true;
    // A fully transparent overlay must not cast an opaque shadow on the iris.
    mesh.castShadow = false;
    repaired++;
  });
  return repaired;
}

function texturePixels(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}
