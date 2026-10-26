import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { SplatSettings, SPLAT_CONTROLS, formatSplatValue } from "../src/scene/splat-settings.js";
import { buildSplatMenuLayout, placeSplatPanel } from "../src/scene/xr-splat-menu.js";
import { createSplatProxy } from "../src/scene/splat-proxy.js";
import { sliderValue, MENU } from "../src/scene/xr-menu-model.js";
import { SpatialMenu } from "../src/scene/xr-menu.js";
import { Viewer } from "../src/scene/Viewer.js";

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
}
function model(id) {
  const root = new T.Group(), mesh = new T.Object3D();
  mesh.userData.gaussianSplat = true; mesh.recolor = new T.Color(.8, .7, .6); mesh.opacity = .8; mesh.maxSh = 3;
  mesh.splats = { getNumSh: () => 3 }; mesh.updateGenerator = () => { mesh.rebuilds = (mesh.rebuilds || 0) + 1; };
  root.add(mesh, createSplatProxy(new T.Box3(new T.Vector3(-.3, 0, -.2), new T.Vector3(.3, 1.8, .2))));
  return { id, name: id, splats: 500, root, wrapper: root, mesh };
}
test("appearance is isolated per model, SH changes rebuild the generator, reset restores source color", () => {
  const settings = new SplatSettings(), a = model("a"), b = model("b");
  settings.attach(a); settings.attach(b);
  settings.set(a, "opacity", .25, true); settings.set(a, "brightness", 2, true); settings.set(a, "maxSh", 0, true);
  assert.equal(a.mesh.opacity, .2); assert.equal(b.mesh.opacity, .8);
  assert.equal(a.mesh.recolor.r, 1.6); assert.equal(b.mesh.recolor.r, .8);
  assert.equal(a.mesh.maxSh, 0); assert.equal(a.mesh.rebuilds, 1);
  settings.reset(a, true);
  assert.equal(a.mesh.opacity, .8); assert.equal(a.mesh.recolor.r, .8); assert.equal(a.mesh.maxSh, 3);
});
test("XR and screen render values persist independently and copy includes the headset profile after exit", () => {
  const saved = storage(), settings = new SplatSettings(saved), a = model("a"); settings.attach(a);
  settings.set(a, "minAlpha", .0004, true); settings.set(a, "foveation", 0, true); settings.set(a, "opacity", .7, true);
  settings.set(a, "blurAmount", .8, false);
  const restored = new SplatSettings(saved), reloaded = model("a"); restored.attach(reloaded);
  assert.equal(restored.state(reloaded, true).values.minAlpha, .0004);
  assert.equal(restored.state(reloaded, false).values.blurAmount, .8);
  assert.equal(restored.state(reloaded, true).values.blurAmount, .3);
  assert.equal(reloaded.splatAppearance.values.opacity, .7);
  const report = JSON.parse(restored.report(reloaded, false));
  assert.equal(report.xrRenderer.foveation, 0); assert.equal(report.xrRenderer.minAlpha, .0004);
  assert.equal(report.appearance.opacity, .7);
});
test("live renderer receives changes without reloading, rejects invalid values and never reduces source splat count", () => {
  const settings = new SplatSettings(), a = model("a"); settings.attach(a);
  const spark = { numSplats: 508670, enableLod: false, setDirty() { this.dirty = true; } };
  let foveation = 1; const xr = { getFoveation: () => foveation, setFoveation: v => { foveation = v; } };
  assert.equal(settings.set(a, "minAlpha", NaN, true), false);
  assert.equal(settings.set(a, "unknown", 1, true), false);
  assert.equal(settings.set(a, "foveation", 0, false), false);
  settings.set(a, "maxStdDev", 99, true); settings.set(a, "premultipliedAlpha", true, true);
  settings.apply(spark, xr, true);
  assert.equal(spark.maxStdDev, 4); assert.equal(spark.premultipliedAlpha, true); assert.equal(foveation, .35);
  assert.equal(spark.numSplats, 508670); assert.equal(spark.enableLod, false);
  settings.apply(spark, xr, false); assert.equal(spark.maxStdDev, Math.sqrt(8));
  const broken = new SplatSettings({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  broken.attach(a); assert.doesNotThrow(() => broken.set(a, "brightness", 1.2, true));
  assert.equal(broken.persistent, false);
});
test("all 15 spatial settings have numeric values or named switches and non-overlapping ray targets", () => {
  const settings = new SplatSettings(), a = model("a"); settings.attach(a);
  const seen = new Set();
  for (let splatPage = 0; splatPage < 4; splatPage++) {
    const layout = buildSplatMenuLayout({ model: a, splatSettings: settings.state(a, true), splatPage });
    for (const c of layout.controls) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= MENU.width && c.y + c.h <= MENU.height);
      assert.ok(c.w >= 80 && c.h >= 80);
      if (c.type === "slider") {
        seen.add(c.key); assert.ok(c.format.length);
        assert.equal(sliderValue(c, c.x), c.min); assert.equal(sliderValue(c, c.x + c.w), c.max);
      } else if (c.id.startsWith("splat:toggle:")) seen.add(c.id.slice(13));
    }
    for (let i = 0; i < layout.controls.length; i++) for (let j = i + 1; j < layout.controls.length; j++) {
      const a = layout.controls[i], b = layout.controls[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, a.id + " overlaps " + b.id);
    }
  }
  assert.equal(seen.size, 15);
  assert.equal(formatSplatValue(SPLAT_CONTROLS.find(c => c.key === "minAlpha"), 0), "0");
  assert.equal(formatSplatValue(SPLAT_CONTROLS.find(c => c.key === "minAlpha"), .5 / 255), "0,001961");
});
test("panel anchors outside model bounds, follows model transforms, and has a stable upright orientation", () => {
  const a = model("a"), camera = new T.PerspectiveCamera(), panel = new T.Group();
  camera.position.set(0, 1.6, 3); camera.updateMatrixWorld();
  assert.equal(placeSplatPanel(panel, a, camera, 1), true);
  assert.ok(panel.position.x - .5 > .3); assert.equal(panel.rotation.x, 0);
  const initial = panel.position.clone(); a.wrapper.position.set(1, 0, 0); a.wrapper.scale.setScalar(2);
  placeSplatPanel(panel, a, camera, 1);
  assert.ok(panel.position.distanceTo(initial) > .5); assert.ok(Number.isFinite(panel.position.y));
});
test("stale model slider events cannot edit the newly selected model; page and toggle dispatch are stable", async () => {
  const settings = new SplatSettings(), a = model("a"), b = model("b"); settings.attach(a); settings.attach(b);
  const viewer = Object.assign(Object.create(Viewer.prototype), { selected: b, splatSettings: settings,
    renderer: { xr: { isPresenting: true } }, emit() {} });
  viewer.setSplatSetting("opacity", 0, "a"); assert.equal(b.mesh.opacity, .8);
  const menu = Object.assign(Object.create(SpatialMenu.prototype), { viewer, pressed: new Map(), hover: new Map(), sync() {} });
  await menu.activate("splat:page:2"); assert.equal(menu.splatPage, 2);
  await menu.activate("splat:toggle:premultipliedAlpha", "b"); assert.equal(viewer.getSplatSettings().values.premultipliedAlpha, true);
});
