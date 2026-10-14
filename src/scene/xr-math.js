import * as T from "three";
import { clampScale } from "../model-utils.js";
export function applyTwoHandTransform(object, gesture, a, b) {
  const vector = b.clone().sub(a),
    initialLength = gesture.vector.length();
  if (initialLength < 0.04 || vector.length() < 0.025) return false;
  const scale = clampScale((gesture.scale * vector.length()) / initialLength),
    ratio = scale / gesture.scale;
  const q = new T.Quaternion().setFromUnitVectors(
    gesture.vector.clone().normalize(),
    vector.normalize(),
  );
  object.position
    .copy(gesture.position)
    .sub(gesture.mid)
    .multiplyScalar(ratio)
    .applyQuaternion(q)
    .add(a.clone().add(b).multiplyScalar(0.5));
  object.quaternion.copy(q).multiply(gesture.quaternion);
  object.scale.setScalar(scale);
  return true;
}
export function validTeleport(point, models, plinth) {
  if (Math.abs(point.x) > 3.7 || point.z < -3.7 || point.z > 5.3) return false;
  if (
    Math.hypot(point.x - plinth.position.x, point.z - plinth.position.z) < 1.65
  )
    return false;
  for (const model of models) {
    const box = new T.Box3().setFromObject(model.wrapper);
    if (
      point.x > box.min.x - 0.25 &&
      point.x < box.max.x + 0.25 &&
      point.z > box.min.z - 0.25 &&
      point.z < box.max.z + 0.25
    )
      return false;
  }
  return true;
}
export function buttonEdge(previous, current) {
  return current && !previous;
}
