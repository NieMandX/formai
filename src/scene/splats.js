import * as T from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { createSplatProxy } from "./splat-proxy.js";

export function createSplatRenderer(renderer) {
  // Keep float32 centers and fp16 colors through the camera-relative accumulator,
  // rather than re-quantizing the extended source into the compact packed format.
  return new SparkRenderer({ renderer, enableLod: false, accumExtSplats: true, premultipliedAlpha: true,
    depthTest: true, depthWrite: false, sortRadial: true });
}

export async function loadGaussianPly(data, info) {
  // Keep every original splat, SH3 and float32 positions; do not generate LoD.
  const splat = new SplatMesh({ fileBytes: data, extSplats: true,
    raycastable: false, enableLod: false });
  try {
    await splat.initialized;
    if (splat.numSplats !== info.count) throw new Error("Не все сплаты удалось прочитать.");
    const bounds = splat.getBoundingBox();
    if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite))
      throw new Error("Некорректные координаты сплатов.");
    splat.userData.gaussianSplat = true;
    const root = new T.Group();
    // Standard 3DGS/COLMAP files use Y-down; the gallery uses Y-up.
    root.rotation.x = Math.PI;
    root.add(splat, createSplatProxy(bounds));
    return { root, clips: [], splats: info.count };
  } catch (error) {
    splat.dispose();
    throw error;
  }
}
