import test from "node:test";
import assert from "node:assert/strict";
import { REFERENCE_MODELS } from "../src/reference-catalog.js";
import { buildMenuLayout } from "../src/scene/xr-menu-model.js";
import { downloadModel } from "../src/scene/download.js";

test("all six full-quality references are selectable in VR before any import", () => {
  const state = { tab: "collection", models: [], model: null, settings: {}, page: 0 };
  const controls = [0, 1, 2].flatMap((page) => buildMenuLayout({ ...state, page }).controls);
  assert.equal(REFERENCE_MODELS.length, 6);
  for (const model of REFERENCE_MODELS) {
    assert.equal(model.textureSize, 8192);
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
    assert.ok(model.bytes < 100 * 1024 * 1024);
    assert.ok(controls.some((c) => c.id === `model:${model.id}` && !c.disabled));
  }
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
