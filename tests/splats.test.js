import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { gaussianPlyInfo } from "../src/scene/splat-format.js";
import { createSplatProxy } from "../src/scene/splat-proxy.js";
import { Viewer } from "../src/scene/Viewer.js";
import { ARWorkspace } from "../src/scene/ar-workspace.js";
import { validateFiles } from "../src/model-utils.js";
import { catalogView, personalModels, SPATIAL_FOLDERS } from "../src/library-catalog.js";
import { SPATIAL_MODELS, spatialPath } from "../src/spatial-catalog.js";
import { SCAN_MODELS } from "../src/scan-catalog.js";
import { buildMaterialMenuLayout } from "../src/scene/xr-material-menu.js";

const fields = "x y z f_dc_0 f_dc_1 f_dc_2 opacity scale_0 scale_1 scale_2 rot_0 rot_1 rot_2 rot_3".split(" ");
function ply(properties = fields, count = 2) {
  const header = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${properties.map(p => `property float ${p}`).join("\n")}\nend_header\n`);
  const bytes = new Uint8Array(header.length + properties.length * count * 4);
  bytes.set(header);
  return bytes.buffer;
}
test("Gaussian detection distinguishes ordinary PLY and rejects truncated payloads", () => {
  assert.equal(gaussianPlyInfo(ply()).count, 2);
  assert.equal(gaussianPlyInfo(ply(["x", "y", "z"])), null);
  assert.throws(() => gaussianPlyInfo(ply().slice(0, -1)), /не полностью/);
  assert.throws(() => gaussianPlyInfo(ply(fields, 0)), /сплатов/);
  assert.equal(validateFiles([{ name: "scan.ply", size: 126151691 }]).length, 1);
  assert.throws(() => validateFiles([{ name: "scan.ply", size: 251 * 1024 ** 2 }]));
});
test("spatial catalog preserves all existing references and routes the new figure as a built-in", () => {
  assert.equal(catalogView("art").entries.flatMap(f => f.models).length, 47 + SCAN_MODELS.length);
  assert.deepEqual(catalogView("art/spatial").entries, [SPATIAL_MODELS[0]]);
  assert.deepEqual(SPATIAL_FOLDERS.flatMap(f => catalogView(f.id).entries), SPATIAL_MODELS);
  for (const model of SPATIAL_MODELS) assert.equal(catalogView(model.folderId).name, model.sourceFolder);
  assert.equal(spatialPath(SPATIAL_MODELS[0], "/formai/"), "/formai/models/spatial/Ariel-Cream-Outfit-024.ply");
  assert.equal(spatialPath(SPATIAL_MODELS[1]), "https://formai-models.s3.cloud.ru/spatial/Ariel-Blue-Swim-026.ply");
  assert.equal(personalModels(SPATIAL_MODELS).length, 0);
});
test("splat bounds support transformed framing, controller rays and near/far limits", () => {
  const proxy = createSplatProxy(new T.Box3(new T.Vector3(-.5, 0, -.5), new T.Vector3(.5, 2, .5)));
  const parent = new T.Group(); parent.add(proxy);
  parent.position.set(3, 0, -4); parent.scale.setScalar(2); parent.rotation.y = Math.PI / 2;
  parent.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(parent, true);
  assert.ok(bounds.getSize(new T.Vector3()).distanceTo(new T.Vector3(2, 4, 2)) < 1e-6);
  const ray = new T.Raycaster(new T.Vector3(3, 2, 0), new T.Vector3(0, 0, -1), 0, 10);
  const hits = ray.intersectObject(parent, true);
  assert.equal(hits.length, 1); assert.equal(hits[0].distance, 3);
  ray.far = 2; assert.equal(ray.intersectObject(parent, true).length, 0);
});
test("spatial models retain transforms, land on AR floor and dispose their own renderer on last unload", () => {
  const v = Object.assign(Object.create(Viewer.prototype), {
    scene: new T.Scene(), models: new Map(), onChange() {}, xr: { cancelGrab() {} },
    renderer: { xr: { isPresenting: false } },
  });
  v.ar = new ARWorkspace(v);
  const mesh = new T.Object3D(); let disposed = 0, rendererDisposed = 0;
  mesh.userData.gaussianSplat = true; mesh.dispose = () => disposed++;
  const root = new T.Group(); root.rotation.x = Math.PI;
  root.add(mesh, createSplatProxy(new T.Box3(new T.Vector3(-.3, -1.5, -.3), new T.Vector3(.3, -.02, .3))));
  const m = v.add({ root, clips: [], splats: 508670 }, { id: "splat", name: "Splat" });
  assert.equal(m.triangles, 0); assert.equal(m.materialControls.length, 0);
  v.setScale(2); m.wrapper.position.y = 3;
  v.ar.floor(m);
  assert.ok(Math.abs(new T.Box3().setFromObject(m.wrapper).min.y) < 1e-6);
  v.splatRenderer = new T.Object3D(); v.splatRenderer.dispose = () => rendererDisposed++;
  v.scene.add(v.splatRenderer);
  v.remove("splat");
  assert.equal(disposed, 1); assert.equal(rendererDisposed, 1); assert.equal(v.splatRenderer, null);
  const menu = buildMaterialMenuLayout({ model: m, materials: [], maps: [], materialPage: 0 });
  assert.ok(menu.controls.some(c => c.id === "unload" && !c.disabled));
  assert.ok(menu.labels.some(l => l.text.includes("PBR-карт нет")));
});
