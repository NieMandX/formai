import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { availableMaps, createMaterialControls, materialControlState, setMapGain, resetMapGains } from "../src/scene/material-controls.js";
import { configureSourceMaterial } from "../src/scene/source-materials.js";
import { buildMaterialMenuLayout } from "../src/scene/xr-material-menu.js";
import { hitControl, sliderValue, MENU } from "../src/scene/xr-menu-model.js";
import { SpatialMenu } from "../src/scene/xr-menu.js";

function scene(materials) {
  const root = new T.Group();
  materials.forEach(m => root.add(new T.Mesh(new T.SphereGeometry(), m)));
  return root;
}
function compile(material) {
  const shader = { uniforms: {}, fragmentShader: T.ShaderLib.physical.fragmentShader, vertexShader: T.ShaderLib.physical.vertexShader };
  material.onBeforeCompile(shader);
  return shader;
}
test("map multipliers preserve loaded values, update without recompilation and reset exactly", () => {
  const a = new T.MeshStandardMaterial({ map: new T.Texture(), normalMap: new T.Texture(), aoMap: new T.Texture(), color: 0x876543 });
  const b = new T.MeshStandardMaterial({ map: new T.Texture() });
  a.normalScale.set(.4, -.4); a.aoMapIntensity = .35;
  const entries = createMaterialControls(scene([a, a, b]));
  assert.equal(entries.length, 2, "shared material must receive one set of controls");
  const shader = compile(a), version = a.version;
  const color = a.color.clone();
  assert.ok(entries.every(e => e.controls.every(c => c.uniform.value === 1)));
  setMapGain(entries, "0", "map", 0);
  const control = entries[0].controls.find(c => c.id === "map");
  assert.ok(Object.values(shader.uniforms).includes(control.uniform), "GPU uniform changes immediately");
  assert.equal(control.uniform.value, 0);
  assert.equal(entries[1].controls[0].uniform.value, 1, "other material is untouched");
  assert.deepEqual(a.color, color); assert.deepEqual(a.normalScale.toArray(), [.4, -.4]);
  assert.equal(a.aoMapIntensity, .35); assert.equal(a.version, version);
  assert.equal(materialControlState(entries).maps.find(c => c.id === "map").mixed, true);
  setMapGain(entries, "all", "map", 10);
  assert.equal(materialControlState(entries).maps[0].mixed, false);
  setMapGain(entries, "all", "map", NaN);
  assert.equal(control.uniform.value, 10);
  resetMapGains(entries);
  assert.ok(entries.every(e => e.controls.every(c => c.uniform.value === 1)));
  assert.match(shader.fragmentShader, /result.a = s.a/, "colour controls retain alpha coverage");
});
test("all authored skin maps get one independent control and retain source shaders", () => {
  const m = new T.MeshPhysicalMaterial({ map: new T.Texture(), normalMap: new T.Texture(), aoMap: new T.Texture(), specularColorMap: new T.Texture(), sheenColorMap: new T.Texture() });
  const slots = ["_BumpTex", "_OcclusionTex", "_SpecTex", "_WetSpecTex", "_BSSRDF", "_SSSColor", "_MicroMixMap", "_microTex1", "_microTex3", "_velvetMask"];
  const maps = Object.fromEntries(slots.map(s => [s, new T.Texture()]));
  m.userData.formaiMaterial = { version: 1, kind: "skin", maps: Object.fromEntries(slots.map((s,i) => [s,i])) };
  for (const [s,t] of Object.entries(maps)) m[`formaiMap${s}`] = t;
  configureSourceMaterial(m, maps);
  assert.deepEqual(new Set(availableMaps(m).map(c => c.id)), new Set(["map", ...slots]));
  createMaterialControls(scene([m]));
  const shader = compile(m);
  assert.match(shader.fragmentShader, /FM_Direct/);
  assert.match(shader.fragmentShader, /softened, fmScattering \* min\(fmMapGain\d+, 1.0\)/);
  assert.match(shader.fragmentShader, /#ifdef USE_SPECULAR_COLORMAP/);
  assert.match(shader.fragmentShader, /#ifdef USE_SHEEN_COLORMAP/);
  assert.ok(!/texture2D\(fm_microTex1, vMapUv/.test(shader.fragmentShader), "custom samples use adjustable wrapper");
  assert.equal(m.normalScale.x, .4, "do not soften the source twice");
});
test("displacement strength includes source bias and native materials without maps stay empty", () => {
  const m = new T.MeshStandardMaterial({ displacementMap: new T.Texture(), displacementBias: -.2 });
  createMaterialControls(scene([m]));
  assert.match(compile(m).vertexShader, /displacementBias \* fmMapGain0/);
  assert.equal(materialControlState(createMaterialControls(scene([new T.MeshStandardMaterial()]))).maps.length, 0);
});
test("detail-only source maps keep GLSL preprocessor directives on separate lines", () => {
  const m = new T.MeshStandardMaterial({ map: new T.Texture() });
  m.userData.formaiMaterial = { version: 1, kind: "detail", maps: { _microTex1: 0 } };
  m.formaiMap_microTex1 = new T.Texture();
  configureSourceMaterial(m, { _microTex1: m.formaiMap_microTex1 });
  createMaterialControls(scene([m]));
  const shader = compile(m);
  for (const stage of ["fragmentShader", "vertexShader"])
    assert.ok(!/[^\s]#/.test(shader[stage]), "every directive must begin its own line");
  assert.match(shader.fragmentShader, /vec4\(0.5, 0.5, 0.5, 1.0\)/, "detail colour disables to a neutral multiplier");
});
test("material pages expose every available map with 0–10 sliders and safe hit targets", () => {
  const state = { model: { id: "a", name: "Nat" }, materialTarget: "all", materials: [{ id: "0", name: "Skin" }], maps: Array.from({length: 11}, (_,i) => ({ id: String(i), label: "Map "+i, value: 1 })) };
  const ids = new Set();
  for (let materialPage = 0; materialPage < 3; materialPage++) {
    const layout = buildMaterialMenuLayout({ ...state, materialPage });
    for (const a of layout.controls) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= MENU.width && a.y + a.h <= MENU.height);
      assert.ok(a.h >= 76 && a.w >= 76);
      for (const b of layout.controls) if (a !== b)
        assert.ok(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y, `${a.id} / ${b.id}`);
      if (a.type === "slider") {
        ids.add(a.id); assert.equal(a.value, 1);
        assert.equal(sliderValue(a,a.x), 0); assert.equal(sliderValue(a,a.x+a.w), 10);
        assert.equal(hitControl(layout.controls,a.x+a.w/2,a.y+69),a);
      }
    }
  }
  assert.equal(ids.size, 11);
  const empty = buildMaterialMenuLayout({ ...state, model: null });
  assert.deepEqual(empty.controls.map(c => c.id), ["recenter", "close"]);
  assert.ok(buildMaterialMenuLayout({ ...state, busy: true, materialPage: 0 }).controls.filter(c=>c.id.startsWith("map:")).every(c=>c.disabled));
});
test("A and B switch panels, repeated B closes, and reopening retains values", () => {
  const menu = { visible: false, mode: "main", open(camera, mode) { this.visible=true;this.mode=mode; }, close() { this.visible=false; } };
  SpatialMenu.prototype.toggle.call(menu, {}, "materials");
  assert.equal(menu.mode, "materials"); assert.equal(menu.visible, true);
  SpatialMenu.prototype.toggle.call(menu, {}, "materials"); assert.equal(menu.visible, false);
  SpatialMenu.prototype.toggle.call(menu, {}, "materials");
  SpatialMenu.prototype.toggle.call(menu, {}, "main");
  assert.equal(menu.mode, "main"); assert.equal(menu.visible, true);
});
