import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { REFERENCE_MODELS } from "../src/reference-catalog.js";
import { makeRobot } from "../src/scene/demos.js";
import { refreshSkinnedBounds } from "../src/scene/model-bounds.js";
import {
  MENU,
  buildMenuLayout,
  hitControl,
  sliderValue,
} from "../src/scene/xr-menu-model.js";
import {
  applyTwoHandTransform,
  validTeleport,
  buttonEdge,
} from "../src/scene/xr-math.js";
const model = {
  id: "test",
  name: "Character",
  scale: 1,
  position: [0, 0.28, 0],
  rotation: 0,
  bones: 11,
  clip: 0,
  clips: Array.from({ length: 9 }, (_, i) => ({
    name: `Clip ${i}`,
    duration: 4,
  })),
  playing: true,
  speed: 1,
  time: 1,
};
const state = {
  model,
  models: [{ ...model, format: "GLB", animations: 9 }],
  settings: { exposure: 1, lighting: "gallery", grid: true, autoRotate: false },
  page: 0,
  clipPage: 0,
};
test("skinned selection and ray bounds follow a relocated normalized skeleton", () => {
  const { root } = makeRobot();
  root.updateMatrixWorld(true);
  const wrapper = new T.Group();
  wrapper.add(root);
  wrapper.position.set(-2, 0.02, 0);
  wrapper.scale.setScalar(0.9);
  // Reproduce a bounds walk before the sibling skeleton's new world pose.
  new T.Box3().setFromObject(wrapper);
  refreshSkinnedBounds(wrapper);
  const cached = new T.Box3().setFromObject(wrapper);
  const precise = new T.Box3().setFromObject(wrapper, true);
  assert.ok(cached.min.distanceTo(precise.min) < 1e-6);
  assert.ok(cached.max.distanceTo(precise.max) < 1e-6);
  const ray = new T.Raycaster(new T.Vector3(-2, 1.2, 3), new T.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(wrapper, true).length > 0);
});
test("spatial hit targets fit their panel, stay large and never overlap", () => {
  for (const tab of ["collection", "object", "animation", "scene", "help"]) {
    const { controls } = buildMenuLayout({ ...state, tab });
    for (const a of controls) {
      assert.ok(
        a.x >= 0 &&
          a.y >= 0 &&
          a.x + a.w <= MENU.width &&
          a.y + a.h <= MENU.height,
        a.id,
      );
      assert.ok(a.w >= 76 && a.h >= 76, a.id);
      for (const b of controls)
        if (a !== b)
          assert.ok(
            a.x + a.w <= b.x ||
              b.x + b.w <= a.x ||
              a.y + a.h <= b.y ||
              b.y + b.h <= a.y,
            `${tab}: ${a.id} overlaps ${b.id}`,
          );
    }
  }
});
test("VR exposes full controls but no upload and confirmation blocks background actions", () => {
  const ids = ["collection", "object", "animation", "scene", "help"].flatMap(
    (tab) => buildMenuLayout({ ...state, tab }).controls.map((c) => c.id),
  );
  for (const id of [
    "scale",
    "rotation",
    "position:x:1",
    "position:y:-1",
    "position:z:1",
    "delete",
    "playing",
    "time",
    "speed",
    "exposure",
    "lighting:neutral",
    "grid",
    "autoRotate",
    "inspect",
    "exit",
  ])
    assert.ok(ids.includes(id), id);
  assert.ok(!ids.some((id) => /upload|import|file|url/.test(id)));
  const modal = buildMenuLayout({
    ...state,
    tab: "object",
    confirm: { type: "delete", name: "Character" },
  });
  assert.deepEqual(
    modal.controls.map((c) => c.id),
    ["cancel", "confirm"],
  );
});
test("paginated collection and clips retain access to all items", () => {
  const models = Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    name: `Model ${i}`,
    format: "GLB",
  }));
  const ids = new Set();
  for (let page = 0; page < Math.ceil((REFERENCE_MODELS.length + models.length + 3) / 4); page++)
    for (const c of buildMenuLayout({
      ...state,
      models,
      page,
      tab: "collection",
    }).controls)
      ids.add(c.id);
  for (const m of models) assert.ok(ids.has("model:" + m.id));
  for (let page = 0; page < 3; page++) {
    const layout = buildMenuLayout({
      ...state,
      tab: "animation",
      clipPage: page,
    });
    assert.ok(layout.controls.some((c) => c.id === `clip:${page * 3 + 2}`));
  }
});
test("slider hit area maps endpoints accurately and clamps dragging beyond track", () => {
  const c = buildMenuLayout({ ...state, tab: "object" }).controls.find(
    (c) => c.id === "scale",
  );
  assert.equal(hitControl([c], c.x + c.w / 2, c.y + 50), c);
  assert.equal(sliderValue(c, c.x - 100), c.min);
  assert.equal(sliderValue(c, c.x + c.w + 100), c.max);
  assert.ok(
    Math.abs(
      Math.exp(
        sliderValue(c, c.x + 28 + ((0 - c.min) / (c.max - c.min)) * (c.w - 56)),
      ) - 1,
    ) < 1e-8,
  );
});
test("two-handed manipulation scales around the midpoint and handles degenerate poses", () => {
  const object = new T.Group(),
    gesture = {
      position: new T.Vector3(0, 1, -1),
      mid: new T.Vector3(0, 1, 0),
      vector: new T.Vector3(1, 0, 0),
      quaternion: new T.Quaternion(),
      scale: 1,
    };
  assert.ok(
    applyTwoHandTransform(
      object,
      gesture,
      new T.Vector3(-1, 1, 0),
      new T.Vector3(1, 1, 0),
    ),
  );
  assert.equal(object.scale.x, 2);
  assert.deepEqual(object.position.toArray(), [0, 1, -2]);
  const before = object.matrix.clone();
  assert.equal(
    applyTwoHandTransform(object, gesture, new T.Vector3(), new T.Vector3()),
    false,
  );
  assert.deepEqual(object.matrix, before);
  applyTwoHandTransform(
    object,
    gesture,
    new T.Vector3(-100, 1, 0),
    new T.Vector3(100, 1, 0),
  );
  assert.equal(object.scale.x, 10);
  assert.equal(object.position.z, -10);
});
test("teleport excludes walls, pedestal and loaded model bounds", () => {
  const plinth = new T.Object3D(),
    mesh = new T.Mesh(new T.BoxGeometry(1, 2, 1));
  mesh.position.set(2, 1, -2);
  mesh.updateMatrixWorld();
  const models = [{ wrapper: mesh }];
  assert.equal(validTeleport(new T.Vector3(0, 0, 0), models, plinth), false);
  assert.equal(validTeleport(new T.Vector3(4, 0, 3), models, plinth), false);
  assert.equal(validTeleport(new T.Vector3(2, 0, -2), models, plinth), false);
  assert.equal(validTeleport(new T.Vector3(-2, 0, 2), models, plinth), true);
});
test("held menu buttons produce only one opening edge", () => {
  assert.equal(buttonEdge(false, true), true);
  assert.equal(buttonEdge(true, true), false);
  assert.equal(buttonEdge(true, false), false);
});
