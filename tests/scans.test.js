import test from "node:test";
import assert from "node:assert/strict";
import { SCAN_MODELS, SCAN_CANDIDATES, selectScanAsset, scanPath } from "../src/scan-catalog.js";
import { catalogView, personalModels, ART_MODEL_COUNT } from "../src/library-catalog.js";
import { buildMenuLayout } from "../src/scene/xr-menu-model.js";

test("unfinished scan assets never appear as selectable models in the catalogue", () => {
  const listed = catalogView("art").entries.flatMap(f => f.models).map(m => m.id);
  for (const model of SCAN_CANDIDATES) {
    if (!model.published || !model.variants.length) assert.ok(!listed.includes(model.id));
    else {
      const path = `art/${model.id}`;
      assert.equal(catalogView(path).name, model.sourceFolder);
      assert.deepEqual(personalModels([model, { id: "user-file" }]), [{ id: "user-file" }]);
      const layout = buildMenuLayout({ collectionPath: path, page: 0, tab: "collection", models: [], settings: {} });
      assert.ok(layout.controls.some(c => c.id === `model:${model.id}` && !c.disabled));
    }
  }
  assert.equal(ART_MODEL_COUNT, 47 + SCAN_MODELS.length);
});
test("scan selection uses actual GPU texture limits, preferring 16K and retaining source 8K as fallback", () => {
  const model = { ...SCAN_CANDIDATES[0], variants: [
    { file: "payton-129-8k-uastc.glb", textureSize: 8192 },
    { file: "payton-129-16k-uastc.glb", textureSize: 16384,
      url: "https://formai-models.s3.cloud.ru/scans/payton-129-16k-uastc.glb" },
  ] };
  const high = selectScanAsset(model, 16384), low = selectScanAsset(model, 8192);
  assert.equal(high.textureSize, 16384); assert.equal(low.textureSize, 8192);
  assert.equal(high.triangles, low.triangles);
  assert.throws(() => selectScanAsset(model, 4096), /8K/);
  assert.equal(scanPath(high, "/formai/", true), "/formai/models/scans/payton-129-16k-uastc.glb");
  assert.equal(scanPath(high), "https://formai-models.s3.cloud.ru/scans/payton-129-16k-uastc.glb");
});
