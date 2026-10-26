import * as T from "three";

// A non-rendered Object3D supplies bounds to Three's Box3 and a cheap controller
// hit target. Never scan half a million Gaussians on every XR pointer frame.
export function createSplatProxy(bounds) {
  const proxy = new T.Object3D();
  proxy.name = "Spatial model bounds";
  proxy.geometry = new T.BufferGeometry();
  proxy.geometry.boundingBox = bounds.clone();
  const inverse = new T.Matrix4(), ray = new T.Ray(), point = new T.Vector3();
  proxy.raycast = function (raycaster, hits) {
    inverse.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverse);
    if (!ray.intersectBox(bounds, point)) return;
    point.applyMatrix4(this.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(point);
    if (distance >= raycaster.near && distance <= raycaster.far)
      hits.push({ distance, point: point.clone(), object: this });
  };
  return proxy;
}
