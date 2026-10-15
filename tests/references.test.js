import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REFERENCE_MODELS, referenceDetail } from "../src/reference-catalog.js";
import { buildMenuLayout } from "../src/scene/xr-menu-model.js";
import { downloadModel } from "../src/scene/download.js";

test("all source poses remain available while individual PBR assets are upgraded", () => {
  const state = { tab: "collection", models: [], model: null, settings: {}, page: 0 };
  const controls = Array.from({ length: Math.ceil((REFERENCE_MODELS.length + 3) / 4) }, (_, page) => page)
    .flatMap((page) => buildMenuLayout({ ...state, page }).controls);
  const sources = JSON.parse(readFileSync(new URL('../scripts/reference-sources.json', import.meta.url))).models;
  assert.equal(REFERENCE_MODELS.length, 43);
  assert.deepEqual(new Set(REFERENCE_MODELS.map((m) => m.id)), new Set(sources.map(m => 'reference-' + m.file.replace('-pose-', '-').replace('.glb', ''))));
  const sites = new Map();
  for (const model of REFERENCE_MODELS) {
    assert.ok([4096, 8192].includes(model.textureSize));
    assert.ok([0, 1].includes(model.materialVersion));
    assert.match(model.file, /^[a-z0-9-]+\.glb$/);
    assert.ok(['reference-sources-v2', 'reference-models-uastc-v2', 'reference-models-pbr-preview-v1'].includes(model.release));
    if (model.materialVersion === 1) assert.equal(model.release, 'reference-models-pbr-preview-v1');
    assert.ok(referenceDetail(model).startsWith(`${model.textureSize / 1024}K`));
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
    assert.ok(model.bytes < 250 * 1024 * 1024);
    sites.set(model.site, (sites.get(model.site) || 0) + model.bytes);
    assert.ok(controls.some((c) => c.id === `model:${model.id}` && !c.disabled));
  }
  for (const bytes of sites.values()) assert.ok(bytes <= 850 * 1024 ** 2);
  const loaded = { ...REFERENCE_MODELS[0], format: "GLB", reference: true };
  const withLoaded = buildMenuLayout({ ...state, models: [loaded], model: loaded });
  assert.equal(withLoaded.controls.filter((c) => c.id === `model:${loaded.id}`).length, 1);
  const busy = buildMenuLayout({ ...state, busy: true });
  assert.ok(busy.controls.filter((c) => c.id.startsWith("model:")).every((c) => c.disabled));
});

test("streamed model downloads report progress and preserve every byte", async (t) => {
  const original = new Uint8Array([1, 3, 5, 7, 9, 11]);
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(original.slice(0, 2));
      controller.enqueue(original.slice(2));
      controller.close();
    },
  })));
  const progress = [];
  const bytes = await downloadModel("https://example.test/model.glb", {
    expectedBytes: original.length, onProgress: (value) => progress.push(value),
  });
  assert.deepEqual(new Uint8Array(bytes), original);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.some((value) => value > 0 && value < 1));
});

test("missing, oversized, truncated and cancelled downloads fail without false success", async (t) => {
  const url = "https://example.test/model.glb";
  const fake = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  await assert.rejects(downloadModel(url), /HTTP 404/);
  fake.mock.mockImplementation(async () => new Response(null, { headers: { "content-length": "200000000" } }));
  await assert.rejects(downloadModel(url), /100 МБ/);
  fake.mock.mockImplementation(async () => new Response(new Uint8Array([1, 2])));
  await assert.rejects(downloadModel(url, { expectedBytes: 10 }), /не полностью/);
  fake.mock.mockImplementation(async (_, { signal }) => { signal.throwIfAborted(); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(downloadModel(url, { signal: controller.signal }), { name: "AbortError" });
});
