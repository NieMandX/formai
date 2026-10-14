import { Sphere } from "three";

// Update the entire skeleton before computing bounds. Box3's recursive walk
// can otherwise visit a skinned mesh before its sibling bones have world poses.
export function refreshSkinnedBounds(root) {
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    object.computeBoundingBox();
    object.boundingSphere ||= new Sphere();
    object.boundingBox.getBoundingSphere(object.boundingSphere);
  });
}
