import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { restoreReferenceEyeTransparency } from "../src/scene/reference-materials.js";

function fixture(prefix = "Eyes-") {
  const root = new T.Group();
  const material = new T.MeshStandardMaterial({ name: "Eyes", map: new T.Texture({ width: 256, height: 256 }) });
  for (const side of ["Left", "Right"]) {
    const mesh = new T.Mesh(new T.BufferGeometry(), material);
    mesh.name = `${prefix}${side}_LOD0_0`;
    mesh.castShadow = true;
    root.add(mesh);
  }
  return { root, material };
}

for (const prefix of ["Eyes-", "Eyes-Clear-"]) test(`${prefix} corneas cannot cover or shadow the underlying scanned eyes`, () => {
  const { root, material } = fixture(prefix);
  const map = material.map;
  let reads = 0;
  assert.equal(restoreReferenceEyeTransparency(root, () => {
    reads++;
    return new Uint8ClampedArray(256 * 256 * 4);
  }), 2);
  assert.equal(reads, 1, "shared material is inspected once, never every frame");
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.map, map, "original texture is retained without resizing");
  assert.ok(root.children.every((mesh) => !mesh.castShadow));
});

test("actual eye textures, other meshes and unreadable imports are left intact", () => {
  for (const mode of ["opaque", "color", "other-mesh", "unreadable"]) {
    const { root, material } = fixture();
    if (mode === "other-mesh") root.children.forEach((mesh) => { mesh.name = "Eye"; });
    const pixels = new Uint8ClampedArray(256 * 256 * 4);
    if (mode === "opaque") pixels[3] = 255;
    if (mode === "color") pixels[0] = 255;
    assert.equal(restoreReferenceEyeTransparency(root, () => {
      if (mode === "unreadable") throw new Error("tainted canvas");
      return pixels;
    }), 0);
    assert.equal(material.transparent, false, mode);
    assert.equal(material.depthWrite, true, mode);
    assert.ok(root.children.every((mesh) => mesh.castShadow), mode);
  }
});
