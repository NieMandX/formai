import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Viewer } from "../src/scene/Viewer.js";
import { ARWorkspace } from "../src/scene/ar-workspace.js";
import { buildMenuLayout, MENU } from "../src/scene/xr-menu-model.js";

function setup() {
  let alpha = 1, color = new T.Color(0x123456);
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    models: new Map(), camera: new T.PerspectiveCamera(), scene: new T.Scene(), rig: new T.Group(),
    gallery: { group: new T.Group() }, settings: { exposure: 1 }, onChange() {},
    renderer: { xr: { isPresenting: false }, getClearColor: target => target.copy(color), getClearAlpha: () => alpha,
      setClearColor(c, a) { color.set(c); alpha = a; } },
    xr: { cancelGrab() {}, cancelInteractions() { this.cancelled = true; }, isManipulating: () => false,
      menu: { close() { this.closed = true; } } },
  });
  viewer.scene.background = new T.Color(0xeeeeee);
  viewer.scene.environment = new T.Texture();
  viewer.camera.position.set(1, 1.65, 3);
  viewer.ar = new ARWorkspace(viewer);
  return viewer;
}
function add(v, id, slot = 0) {
  return v.add({ root: new T.Mesh(new T.BoxGeometry(1, 2, 1), new T.MeshStandardMaterial()), clips: [] }, { id, name: id, slot });
}
const pose = m => [m.wrapper.position.toArray(), m.wrapper.quaternion.toArray(), m.wrapper.scale.toArray()];

test("AR reveals passthrough but retains PBR lighting; exit restores desktop transforms including new models", () => {
  const v = setup(), a = add(v, "a"), original = pose(a);
  const background = v.scene.background, environment = v.scene.environment;
  v.ar.begin(); v.ar.begin(); v.ar.initialize();
  assert.equal(v.scene.background, null);
  assert.equal(v.gallery.group.visible, false);
  assert.equal(v.renderer.getClearAlpha(), 0);
  assert.equal(v.scene.environment, environment);
  assert.deepEqual(v.rig.position.toArray(), [0, 0, 0]);
  assert.deepEqual(a.wrapper.position.toArray(), [1, 0, 1]);
  const b = add(v, "b");
  assert.notEqual(b.wrapper.position.x, a.wrapper.position.x);
  a.wrapper.position.set(4, 2, -1);
  a.wrapper.scale.setScalar(2);
  v.ar.end(); v.ar.end();
  assert.deepEqual(pose(a), original);
  assert.deepEqual(b.wrapper.position.toArray(), [-2, 0.02, 0]);
  assert.equal(v.scene.background, background);
  assert.equal(v.renderer.getClearAlpha(), 1);
  assert.equal(v.renderer.getClearColor(new T.Color()).getHex(), 0x123456);
  assert.equal(v.gallery.group.visible, true);
  v.ar.begin(); v.ar.initialize(); v.ar.end();
  assert.deepEqual(pose(a), original, "re-entry does not accumulate transforms");
});

test("AR placement follows tracked head yaw and lowering uses transformed bounds", () => {
  const v = setup(), m = add(v, "a");
  v.camera.rotation.y = Math.PI / 2;
  v.ar.begin(); v.ar.initialize();
  assert.ok(m.wrapper.position.distanceTo(new T.Vector3(-1, 0, 3)) < 1e-8);
  m.wrapper.rotation.z = Math.PI / 4;
  m.wrapper.position.y = 4;
  m.wrapper.scale.setScalar(2);
  v.ar.floor();
  assert.ok(Math.abs(new T.Box3().setFromObject(m.wrapper, true).min.y) < 1e-8);
  v.camera.rotation.set(-Math.PI / 2, 0, 0);
  v.ar.placeSelected(true);
  assert.ok(m.wrapper.position.toArray().every(Number.isFinite));
  assert.equal(m.wrapper.scale.x, 1);
});

test("drawing freezes all animations and pose edits, then resumes previous playback states", async () => {
  const v = setup(), a = add(v, "a"), b = add(v, "b");
  a.playing = true; b.playing = false;
  let elapsedA = 0, elapsedB = 0;
  a.mixer = { update: dt => elapsedA += dt }; b.mixer = { update: dt => elapsedB += dt };
  v.autoRotate = true;
  v.ar.begin(); v.ar.initialize(); v.ar.setDrawing(true);
  const before = pose(b);
  v.updateModels(0.05, 1000);
  v.setScale(2); v.setPosition("x", 5); v.setRotation(90); v.resetSelected(); v.setPlaying(true);
  v.ar.placeSelected(); v.ar.floor();
  await assert.rejects(v.ensureModel("architecture"), /Снимите фиксацию/);
  assert.deepEqual(pose(b), before);
  assert.equal(b.playing, false);
  assert.equal(elapsedA, 0); assert.equal(elapsedB, 0);
  assert.equal(v.xr.cancelled, true); assert.equal(v.xr.menu.closed, true);
  v.ar.setDrawing(false); v.updateModels(0.05, 1050);
  assert.equal(elapsedA, .05); assert.equal(elapsedB, 0);
  assert.notDeepEqual(pose(b), before, "auto rotation resumes");
  v.ar.setDrawing(true); v.ar.end();
  assert.equal(v.ar.drawing, false);
  assert.equal(a.playing, true); assert.equal(b.playing, false);
});

test("drawing lock cannot start during download or without models; unloading drops retained AR resources", () => {
  const v = setup(); v.ar.begin(); v.ar.initialize(); v.ar.setDrawing(true);
  assert.equal(v.ar.drawing, false);
  const a = add(v, "a"); v.catalogLoad = { id: "b" }; v.ar.setDrawing(true);
  assert.equal(v.ar.drawing, false);
  v.catalogLoad = null; v.ar.setDrawing(true);
  assert.equal(v.ar.drawing, true);
  v.remove(a.id);
  assert.equal(v.ar.poses.size, 0);
  v.ar.setDrawing(false);
  assert.equal(v.ar.drawing, false, "can always unlock an empty scene");
});

test("AR menus keep large nonoverlapping targets and expose an unlock path without pose editing", () => {
  const v = setup(); add(v, "a");
  const state = { ar: true, drawing: true, models: [{ id: "a" }], settings: { exposure: 1 },
    model: { id: "a", name: "A", position: [0, 0, 0], clips: [{ name: "Move", duration: 5 }], clip: 0, speed: 1 }, page: 0, clipPage: 0 };
  for (const tab of ["drawing", "collection", "object", "animation", "scene", "help"]) {
    const { controls } = buildMenuLayout({ ...state, tab });
    for (const a of controls) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= MENU.width && a.y + a.h <= MENU.height, a.id);
      assert.ok(a.w >= 76 && a.h >= 76, a.id);
      for (const b of controls) if (a !== b)
        assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${tab}: ${a.id} overlaps ${b.id}`);
    }
    assert.ok(!controls.find(c => c.id === "tab:drawing").disabled);
    for (const id of ["scale", "rotation", "time", "playing", "reset", "inspect", "grid", "autoRotate"])
      if (controls.some(c => c.id === id)) assert.ok(controls.find(c => c.id === id).disabled, id);
  }
  const lock = buildMenuLayout({ ...state, tab: "drawing", models: [] }).controls.find(c => c.id === "drawing:lock");
  assert.equal(lock.text, "Снять фиксацию"); assert.ok(!lock.disabled);
});

test("XR startup requests the chosen mode and recovers from permission and renderer failures", async (t) => {
  const v = setup(), previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => previous ? Object.defineProperty(globalThis, "navigator", previous) : delete globalThis.navigator);
  let requested, ended = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { xr: {
    async requestSession(mode, options) { requested = { mode, options }; return { end: async () => ended++ }; },
  } } });
  v.renderer.xr.setSession = async () => { v.ar.begin(); throw new Error("renderer failure"); };
  await assert.rejects(v.enterAR(), /renderer failure/);
  assert.equal(requested.mode, "immersive-ar");
  assert.deepEqual(requested.options.requiredFeatures, ["local-floor"]);
  assert.equal(ended, 1); assert.equal(v.ar.active, false); assert.equal(v.xrMode, null); assert.equal(v.xrStarting, false);
  navigator.xr.requestSession = async () => { throw new Error("permission denied"); };
  await assert.rejects(v.enterAR(), /permission denied/);
  assert.equal(v.xrStarting, false); assert.equal(v.xrMode, null);
  navigator.xr.requestSession = async mode => { requested = mode; return {}; };
  v.renderer.xr.setSession = async () => {};
  await v.enterVR(); assert.equal(requested, "immersive-vr");
});
