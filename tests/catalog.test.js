import test from "node:test";
import assert from "node:assert/strict";
import { catalogView, ART_FOLDERS } from "../src/library-catalog.js";
import { REFERENCE_MODELS } from "../src/reference-catalog.js";
import { buildMenuLayout, MENU } from "../src/scene/xr-menu-model.js";
import { SpatialMenu } from "../src/scene/xr-menu.js";

test("Art partitions all 43 references exactly once under the original source directories", () => {
  assert.deepEqual(catalogView().entries.map(f => f.name), ["Art", "Arch"]);
  assert.deepEqual(catalogView("art").entries.filter(f => f.id !== "art/spatial").map(f => [f.name, f.models.length]), [
    ["VRGirlz-09-Ariel-BVR-v1.5", 10],
    ["VRGirlz-18-Nat-AVR-v1.5", 10],
    ["VRGirlz-21-Nat-AVR-v1.5", 5],
    ["VRGirlz-22-Chloe-BVR-v1.5", 10],
    ["VRGirlz-Lucid-Dreams-II-v1.5", 8],
  ]);
  const ids = ART_FOLDERS.flatMap(f => catalogView(f.id).entries.map(m => m.id));
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
  assert.deepEqual(new Set(ids), new Set(REFERENCE_MODELS.map(m => m.id)));
  assert.deepEqual(catalogView("arch").entries.map(m => m.id), ["robot", "architecture", "knot"]);
});

test("loaded built-ins stay in their folders and personal models remain separately accessible", () => {
  const models = [REFERENCE_MODELS[0], { id: "robot", name: "Робот" }, { id: "own-model", name: "My model", format: "GLB" }];
  assert.equal(catalogView("", models).entries.length, 2);
  assert.deepEqual(catalogView("local", models).entries.map(m => m.id), ["own-model"]);
  assert.equal(catalogView("arch", models).entries.length, 3);
  assert.equal(catalogView("art/ariel", models).entries.length, 10);
  assert.equal(catalogView("invalid").path, "");
});

test("VR folder navigation resets pagination and pointers without changing the selected model", async () => {
  const selected = { id: "keep-me" };
  const menu = { viewer: { selected }, page: 2, collectionPath: "art/ariel", pressed: new Map([[1, {}]]), hover: new Map([[1, {}]]), sync() {} };
  await SpatialMenu.prototype.activate.call(menu, "folder:art");
  assert.equal(menu.collectionPath, "art");
  assert.equal(menu.page, 0);
  assert.equal(menu.pressed.size, 0);
  assert.equal(menu.hover.size, 0);
  assert.equal(menu.viewer.selected, selected);
  await SpatialMenu.prototype.activate.call(menu, "folder:");
  assert.equal(menu.collectionPath, "");
  await SpatialMenu.prototype.activate.call(menu, "folder:local");
  assert.equal(menu.collectionPath, "local");
});

test("all folder pages have safe VR hit targets and a route to the parent", () => {
  for (const collectionPath of ["", "art", "arch", "local", ...ART_FOLDERS.map(f => f.id)]) {
    const view = catalogView(collectionPath);
    for (let page = 0; page < Math.max(1, Math.ceil(view.entries.length / 4)); page++) {
      const { controls } = buildMenuLayout({ collectionPath, page, tab: "collection", models: [{ id: "own", format: "GLB", name: "Own" }], settings: {} });
      if (view.parent !== null) assert.ok(controls.some(c => c.id === "folder:" + view.parent));
      for (const a of controls) {
        assert.ok(a.w >= 76 && a.h >= 76 && a.x >= 0 && a.y >= 0 && a.x + a.w <= MENU.width && a.y + a.h <= MENU.height, a.id);
        for (const b of controls) if (a !== b)
          assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${collectionPath}: ${a.id} / ${b.id}`);
      }
    }
  }
});
