import test from "node:test";
import assert from "node:assert/strict";
import {
  validateFiles,
  validateModelURL,
  normalizedPath,
  clampScale,
  MAX_FILE_BYTES,
} from "../src/model-utils.js";
import { makeRobot } from "../src/scene/demos.js";
import { AnimationMixer } from "three";
test("multifile glTF import ignores supporting buffers and textures as main models", () => {
  assert.deepEqual(
    validateFiles([
      { name: "hero.GLTF", size: 20 },
      { name: "hero.bin", size: 10 },
      { name: "base.png", size: 5 },
    ]).map((f) => f.name),
    ["hero.GLTF"],
  );
});
test("unsupported formats and excessive memory budgets are rejected", () => {
  assert.throws(() => validateFiles([{ name: "model.blend", size: 3 }]));
  assert.throws(() =>
    validateFiles([{ name: "model.glb", size: MAX_FILE_BYTES + 1 }]),
  );
  assert.throws(() =>
    validateFiles(
      Array.from({ length: 3 }, () => ({
        name: "m.glb",
        size: MAX_FILE_BYTES,
      })),
    ),
  );
});
test("model URLs allow HTTPS and localhost, reject executable and insecure protocols", () => {
  assert.equal(
    validateModelURL("https://example.com/hero.glb?token=test").pathname,
    "/hero.glb",
  );
  for (const u of [
    "javascript:alert(1)",
    "file:///tmp/model.glb",
    "http://example.com/a.glb",
    "https://example.com/a.html",
  ])
    assert.throws(() => validateModelURL(u));
});
test("resource paths retain subdirectories and normalize encoded names", () => {
  assert.equal(
    normalizedPath("folder/textures/../textures/skin%20color.png"),
    "folder/textures/skin color.png",
  );
  assert.equal(normalizedPath("folder\\a.png"), "folder/a.png");
});
test("scale limits prevent invalid transforms", () => {
  assert.equal(clampScale(0), 1);
  assert.equal(clampScale(-10), 0.05);
  assert.equal(clampScale(100), 10);
  assert.equal(clampScale(NaN), 1);
});
test("demo is a real skinned mesh and clips animate bones", () => {
  const { root, clips } = makeRobot();
  let skin;
  root.traverse((o) => {
    if (o.isSkinnedMesh) skin = o;
  });
  assert.ok(skin);
  assert.equal(skin.skeleton.bones.length, 11);
  assert.equal(clips.length, 3);
  const leg = root.getObjectByName("LeftLeg");
  const before = leg.quaternion.toArray();
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clips[1]).play();
  mixer.update(0.15);
  assert.notDeepEqual(leg.quaternion.toArray(), before);
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
});
