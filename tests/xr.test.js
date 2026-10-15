import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { REFERENCE_MODELS } from "../src/reference-catalog.js";
import { SpatialMenu } from "../src/scene/xr-menu.js";
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
  moveSmooth,
  turnSmooth,
  scaleSmooth,
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
test("collection pagination moves immediately after removing models from the last page", async () => {
  const oldPage = Math.ceil((REFERENCE_MODELS.length + 3 + 12) / 4) - 1;
  const lastRemainingPage = Math.ceil((REFERENCE_MODELS.length + 3) / 4) - 1;
  const menu = {
    viewer: {}, page: oldPage, sync() {},
    layout: buildMenuLayout({ ...state, tab: "collection", models: [], page: oldPage }),
  };
  await SpatialMenu.prototype.activate.call(menu, "page:prev");
  assert.equal(menu.page, lastRemainingPage - 1);
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

function walkingScene() {
  const rig = new T.Group(), camera = new T.PerspectiveCamera();
  rig.position.set(-2.5, 0, 3.6);
  camera.position.set(0, 1.65, 0);
  rig.add(camera);
  rig.updateMatrixWorld(true);
  return { rig, camera, plinth: new T.Object3D() };
}
test("smooth locomotion is analog, frame-rate independent and stops on stick release", () => {
  const walk = (fps, axis) => {
    const { rig, camera, plinth } = walkingScene();
    for (let i = 0; i < fps; i++) {
      moveSmooth(rig, camera, axis, 1 / fps, [], plinth);
      rig.updateMatrixWorld(true);
    }
    return rig.position.z;
  };
  assert.ok(Math.abs(walk(72, -1) - 2.4) < 1e-8);
  assert.ok(Math.abs(walk(120, -1) - walk(72, -1)) < 1e-8);
  assert.ok(Math.abs(walk(90, 1) - 4.8) < 1e-8);
  assert.ok(Math.abs(walk(90, -0.59) - 3) < 1e-8);
  const { rig, camera, plinth } = walkingScene();
  moveSmooth(rig, camera, -1, 1 / 90, [], plinth);
  rig.updateMatrixWorld(true);
  const stopped = rig.position.clone();
  for (const axis of [0, 0.1, -0.18, NaN])
    assert.equal(moveSmooth(rig, camera, axis, 1 / 90, [], plinth), false);
  assert.deepEqual(rig.position, stopped);
});
test("walking follows head yaw without changing height, including a vertical gaze", () => {
  for (const pitch of [0, Math.PI / 3, Math.PI / 2, -Math.PI / 2]) {
    const { rig, camera, plinth } = walkingScene();
    camera.rotation.set(pitch, -Math.PI / 2, 0, "YXZ");
    rig.updateMatrixWorld(true);
    moveSmooth(rig, camera, -1, 0.05, [], plinth);
    assert.ok(Math.abs(rig.position.x + 2.44) < 1e-8);
    assert.ok(Math.abs(rig.position.z - 3.6) < 1e-8);
    assert.equal(rig.position.y, 0);
    assert.equal(camera.position.y, 1.65);
  }
});
test("walking respects the tracked head, walls, pedestal and model bounds", () => {
  const { rig, camera, plinth } = walkingScene();
  rig.position.set(0, 0, 3.6);
  camera.position.z = 1.69; // Physical movement has already put the head near the wall.
  rig.updateMatrixWorld(true);
  assert.equal(moveSmooth(rig, camera, 1, 0.05, [], plinth), false);
  camera.position.z = 0;
  rig.position.z = 1.66;
  rig.updateMatrixWorld(true);
  assert.equal(moveSmooth(rig, camera, -1, 0.05, [], plinth), false);
  const mesh = new T.Mesh(new T.BoxGeometry(1, 2, 1));
  mesh.position.set(-2.5, 1, 0);
  mesh.updateMatrixWorld(true);
  rig.position.set(-2.5, 0, 0.76);
  rig.updateMatrixWorld(true);
  assert.equal(moveSmooth(rig, camera, -1, 0.05, [{ wrapper: mesh }].values(), plinth), false);
  // Backing away from an obstacle remains possible.
  assert.equal(moveSmooth(rig, camera, 1, 0.05, [{ wrapper: mesh }].values(), plinth), true);
});
test("a delayed frame cannot produce a long locomotion jump", () => {
  const { rig, camera, plinth } = walkingScene();
  moveSmooth(rig, camera, -1, 5, [], plinth);
  assert.ok(Math.abs(rig.position.z - 3.54) < 1e-8);
});
test("turn speed follows analog deflection continuously and independently of frame rate", () => {
  const turn = (fps, axis) => {
    const { rig, camera } = walkingScene();
    for (let i = 0; i < fps; i++) turnSmooth(rig, camera, axis, 1 / fps);
    return rig.rotation.y;
  };
  assert.ok(Math.abs(turn(90, 1) + Math.PI / 2) < 1e-8);
  assert.ok(Math.abs(turn(90, 0.59) + Math.PI / 4) < 1e-8);
  assert.ok(Math.abs(turn(90, -1) - Math.PI / 2) < 1e-8);
  assert.ok(Math.abs(turn(72, 1) - turn(120, 1)) < 1e-8);
  assert.equal(turn(90, 0.18), 0);
  assert.equal(turn(90, 0), 0);
});
test("turning keeps the physically offset head in place and stops immediately", () => {
  const { rig, camera } = walkingScene();
  camera.position.set(0.8, 1.65, -0.4);
  rig.updateMatrixWorld(true);
  const pivot = camera.getWorldPosition(new T.Vector3());
  for (let i = 0; i < 90; i++) turnSmooth(rig, camera, 1, 1 / 90);
  assert.ok(camera.getWorldPosition(new T.Vector3()).distanceTo(pivot) < 1e-8);
  const stopped = rig.rotation.y;
  for (const axis of [0, -0.1, NaN])
    assert.equal(turnSmooth(rig, camera, axis, 1 / 90), false);
  assert.equal(rig.rotation.y, stopped);
  turnSmooth(rig, camera, 1, 5);
  assert.ok(Math.abs(rig.rotation.y - stopped + Math.PI / 40) < 1e-8);
});

test("thumbstick scaling is proportional, frame-rate independent and reversible without moving the model", () => {
  const run = (fps, axis) => {
    const object = new T.Object3D();
    object.position.set(1, 0.28, -2);
    for (let i = 0; i < fps; i++) scaleSmooth(object, axis, 1 / fps);
    assert.deepEqual(object.position.toArray(), [1, 0.28, -2]);
    return object;
  };
  assert.ok(Math.abs(run(72, -1).scale.x - 2) < 1e-8);
  assert.ok(Math.abs(run(120, -1).scale.x - run(72, -1).scale.x) < 1e-8);
  assert.ok(Math.abs(run(90, -0.59).scale.x - Math.sqrt(2)) < 1e-8);
  const object = run(90, -1);
  for (let i = 0; i < 90; i++) scaleSmooth(object, 1, 1 / 90);
  assert.ok(Math.abs(object.scale.x - 1) < 1e-8);
  for (const axis of [0, 0.18, -0.1, NaN]) assert.equal(scaleSmooth(object, axis, 1 / 90), false);
  assert.deepEqual(object.scale.toArray(), [object.scale.x, object.scale.x, object.scale.x]);
});

test("thumbstick scaling respects size limits and bounds delayed frames", () => {
  const object = new T.Object3D();
  scaleSmooth(object, -1, 5);
  assert.ok(Math.abs(object.scale.x - Math.pow(2, 0.05)) < 1e-8);
  object.scale.setScalar(10);
  assert.equal(scaleSmooth(object, -1, 1 / 90), false);
  assert.equal(object.scale.x, 10);
  object.scale.setScalar(0.05);
  assert.equal(scaleSmooth(object, 1, 1 / 90), false);
  assert.equal(object.scale.x, 0.05);
  assert.equal(scaleSmooth(null, -1, 1 / 90), false);
});
