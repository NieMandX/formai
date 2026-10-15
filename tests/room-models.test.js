import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Viewer } from "../src/scene/Viewer.js";
import { SpatialMenu } from "../src/scene/xr-menu.js";
import { buildMaterialMenuLayout } from "../src/scene/xr-material-menu.js";
import { buildMenuLayout } from "../src/scene/xr-menu-model.js";
import { setMapGain } from "../src/scene/material-controls.js";
import { REFERENCE_MODELS } from "../src/reference-catalog.js";

function viewer() {
  return Object.assign(Object.create(Viewer.prototype), {
    models: new Map(), scene: new T.Scene(), xr: { cancelGrab() {} },
    renderer: { xr: { isPresenting: false } }, onChange() {}, focus() {},
  });
}
function model(v, id) {
  const texture = new T.Texture();
  const material = new T.MeshStandardMaterial({ map: texture });
  material.formaiMap_microTex1 = new T.Texture();
  const root = new T.Mesh(new T.BoxGeometry(), material);
  return v.add({ root, clips: [] }, { id, name: id, reference: true });
}

test("multiple models retain their positions and material gains; unloading only disposes its own resources", () => {
  const v = viewer(), a = model(v, "a");
  a.wrapper.position.set(2, 1, -3);
  setMapGain(a.materialControls, "all", "map", .3);
  const b = model(v, "b");
  assert.equal(v.models.size, 2);
  assert.notEqual(a.slot, b.slot);
  assert.deepEqual(a.wrapper.position.toArray(), [2, 1, -3]);
  assert.equal(a.materialControls[0].controls.find(c => c.id === "map").uniform.value, .3);
  const disposed = [];
  for (const [name, resource] of Object.entries({ geometry: b.root.geometry, material: b.root.material, texture: b.root.material.map, detail: b.root.material.formaiMap_microTex1 }))
    resource.addEventListener("dispose", () => disposed.push(name));
  let aDisposed = 0;
  a.root.material.map.addEventListener("dispose", () => aDisposed++);
  v.remove("b");
  assert.deepEqual(disposed.sort(), ["detail", "geometry", "material", "texture"]);
  assert.equal(v.scene.children.includes(b.wrapper), false);
  assert.equal(v.models.get("a"), a);
  assert.equal(aDisposed, 0, "other model texture remains live");
  assert.equal(v.selected, a);
  const c = model(v, "c");
  assert.equal(c.slot, b.slot, "freed room slot can be reused");
  v.remove("c"); v.remove("a");
  assert.equal(aDisposed, 1);
  assert.equal(v.selected, null);
});

test("room limit counts loaded references before downloading; selecting an existing model creates no duplicate", async () => {
  const v = viewer();
  for (let i = 0; i < 12; i++) model(v, "loaded-" + i);
  await assert.rejects(v.ensureModel(REFERENCE_MODELS[0].id), /12 моделей/);
  assert.equal(v.catalogLoad, undefined, "no download started when room is full");
  await v.ensureModel("loaded-0");
  assert.equal(v.selected.id, "loaded-0");
  assert.equal(v.models.size, 12);
});

test("material unload works for models without maps and never calls persistent file deletion", async () => {
  const v = viewer();
  const a = model(v, "a"), b = model(v, "b");
  v.onDeleteRequest = () => assert.fail("room unload must not delete saved files");
  const menu = { viewer: v, sync() {}, close() { this.closed = true; } };
  const layout = buildMaterialMenuLayout({ model: b, materials: [], maps: [], materialPage: 0 });
  const unload = layout.controls.find(c => c.id === "unload");
  assert.equal(unload.modelId, "b");
  assert.ok(!unload.disabled);
  await SpatialMenu.prototype.activate.call(menu, "unload", "a");
  assert.equal(v.models.size, 2, "stale click cannot unload a different selection");
  v.catalogLoad = { id: "loading" };
  await SpatialMenu.prototype.activate.call(menu, "unload", "b");
  assert.equal(v.models.size, 2);
  v.catalogLoad = null;
  await SpatialMenu.prototype.activate.call(menu, "unload", "b");
  assert.equal(v.models.has("b"), false);
  assert.equal(v.models.get("a"), a);
  assert.ok(menu.closed, "close the panel to prevent an accidental second unload");
  assert.ok(buildMaterialMenuLayout({ model: a, materials: [], maps: [], busy: true }).controls.find(c => c.id === "unload").disabled);
});

test("VR catalogue marks every loaded reference, including unselected poses", () => {
  const [a, b] = REFERENCE_MODELS;
  const state = { tab: "collection", page: 0, model: b, models: [a, b], settings: {} };
  const { controls } = buildMenuLayout(state);
  assert.match(controls.find(c => c.id === "model:" + a.id).subtitle, /в комнате/);
  assert.match(controls.find(c => c.id === "model:" + b.id).subtitle, /выбрана/);
});
