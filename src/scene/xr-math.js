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
  return validFloorPoint(
    point,
    [...models].map((model) => new T.Box3().setFromObject(model.wrapper)),
    plinth.position,
  );
}
function validFloorPoint(point, boxes, plinthPosition) {
  if (Math.abs(point.x) > 3.7 || point.z < -3.7 || point.z > 5.3) return false;
  if (
    Math.hypot(point.x - plinthPosition.x, point.z - plinthPosition.z) < 1.65
  )
    return false;
  for (const box of boxes) {
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

function analogAmount(axis, dt) {
  const deadzone = 0.18;
  if (!Number.isFinite(axis) || !Number.isFinite(dt) || Math.abs(axis) <= deadzone || dt <= 0)
    return 0;
  return Math.sign(axis) * (Math.min(1, Math.abs(axis)) - deadzone) / (1 - deadzone);
}

// Exponential scaling feels consistent at every model size. Full forward doubles
// the size in one second; returning to centre stops immediately.
export function scaleSmooth(object, axis, dt) {
  const amount = analogAmount(axis, dt);
  if (!object || !amount) return false;
  const before = object.scale.x;
  const scale = clampScale(before * Math.exp(-amount * Math.LN2 * Math.min(dt, 0.05)));
  if (scale === before) return false;
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);
  return true;
}

export function turnSmooth(rig, camera, axis, dt) {
  const amount = analogAmount(axis, dt);
  if (!amount) return false;
  const yaw = -amount * Math.PI / 2 * Math.min(dt, 0.05);
  const pivot = camera.getWorldPosition(new T.Vector3());
  // Turn around the user's tracked head, including physical room-scale movement.
  rig.position.sub(pivot).applyAxisAngle(new T.Vector3(0, 1, 0), yaw).add(pivot);
  rig.rotation.y += yaw;
  rig.updateMatrixWorld(true);
  return true;
}

// Positive WebXR thumbstick Y means backward. No momentum after release.
export function moveSmooth(rig, camera, axis, dt, models, plinth) {
  const amount = analogAmount(axis, dt);
  if (!amount) return false;
  const direction = camera.getWorldDirection(new T.Vector3());
  direction.y = 0;
  if (direction.lengthSq() < 1e-6) {
    // Preserve a horizontal heading even when looking straight up or down.
    const right = new T.Vector3(1, 0, 0).applyQuaternion(
      camera.getWorldQuaternion(new T.Quaternion()),
    );
    direction.set(right.z, 0, -right.x);
  }
  if (direction.lengthSq() < 1e-6) return false;
  const distance = -amount * 1.2 * Math.min(dt, 0.05);
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / 0.025));
  const step = direction.normalize().multiplyScalar(distance / steps);
  // Use the tracked head, including physical walking, rather than the rig origin.
  const start = camera.getWorldPosition(new T.Vector3());
  const point = start.clone(), candidate = start.clone();
  const boxes = [...models].map((model) => new T.Box3().setFromObject(model.wrapper));
  for (let i = 0; i < steps; i++) {
    candidate.copy(point).add(step);
    if (!validFloorPoint(candidate, boxes, plinth.position)) break;
    point.copy(candidate);
  }
  rig.position.x += point.x - start.x;
  rig.position.z += point.z - start.z;
  return point.distanceToSquared(start) > 0;
}
export function buttonEdge(previous, current) {
  return current && !previous;
}
