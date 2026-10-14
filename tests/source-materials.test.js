import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { configureSourceMaterial, hydrateSourceMaterials } from "../src/scene/source-materials.js";
import { disposeObject } from "../src/scene/loaders.js";

const texture = () => new T.Texture({ width: 4, height: 4 });
function material(kind, slots) {
  const m = kind === "detail" ? new T.MeshStandardMaterial() : new T.MeshPhysicalMaterial();
  m.userData.formaiMaterial = { version: 1, kind, maps: Object.fromEntries(slots.map((s, i) => [s, i])), floats: {}, colors: {} };
  return m;
}

test("source maps hydrate once per shared material and dispose with the model", async () => {
  const m = material("detail", ["_microTex1"]), map = texture(), root = new T.Group();
  root.add(new T.Mesh(new T.BufferGeometry(), m), new T.Mesh(new T.BufferGeometry(), m));
  let loads = 0, disposals = 0;
  map.addEventListener("dispose", () => disposals++);
  await hydrateSourceMaterials({ scene: root, parser: { getDependency: async (type, index) => {
    assert.equal(type, "texture"); assert.equal(index, 0); loads++; return map;
  } } });
  assert.equal(loads, 1);
  assert.equal(map.colorSpace, T.SRGBColorSpace);
  assert.equal(map.flipY, false);
  disposeObject(root);
  assert.equal(disposals, 1, "shared custom maps must not leak or be double-disposed");
});

test("standard imported GLTF materials are never patched", async () => {
  const m = new T.MeshStandardMaterial(), root = new T.Group(), before = m.onBeforeCompile;
  root.add(new T.Mesh(new T.BufferGeometry(), m));
  await hydrateSourceMaterials({ scene: root, parser: { getDependency: () => assert.fail("Unrelated import") } });
  assert.equal(m.onBeforeCompile, before);
});

test("corneal specular reflections survive zero alpha without an opaque eye surface", () => {
  const m = material("cornea", ["_SpecTex", "_BumpMap"]);
  configureSourceMaterial(m, { _SpecTex: texture(), _BumpMap: texture() });
  assert.equal(m.transparent, true);
  assert.equal(m.depthWrite, false);
  assert.equal(m.blendSrc, T.OneFactor);
  assert.equal(m.blendDst, T.OneMinusSrcAlphaFactor);
  assert.equal(m.premultipliedAlpha, false);
  const shader = { uniforms: {}, fragmentShader: T.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /1\.0 - texture2D\(specularColorMap, vMapUv\)\.a/);
});

test("skin shader consumes every source map using existing native samplers where possible", () => {
  const slots = ["_BumpTex", "_OcclusionTex", "_SpecTex", "_WetSpecTex", "_BSSRDF", "_SSSColor", "_MicroMixMap", "_microTex1", "_microTex3", "_velvetMask"];
  const m = material("skin", slots);
  const maps = Object.fromEntries(slots.map((slot) => [slot, texture()]));
  configureSourceMaterial(m, maps);
  const shader = { uniforms: {}, fragmentShader: T.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(shader);
  for (const slot of ["_WetSpecTex", "_BSSRDF", "_SSSColor", "_MicroMixMap", "_microTex1", "_microTex3"]) {
    assert.equal(shader.uniforms[`fm${slot}`].value, maps[slot]);
    assert.match(shader.fragmentShader, new RegExp(`texture2D\\(fm${slot},`), slot);
  }
  assert.match(shader.fragmentShader, /float ndl = dot\(normal, light.direction\)/, "diffusion follows light direction, not camera angle");
  assert.match(shader.fragmentShader, /texture2D\(aoMap, vMapUv\)\.g/, "cavity uses G while native AO uses R");
  assert.match(shader.fragmentShader, /texture2D\(specularColorMap, vMapUv\)\.a \* fmDryRoughness/);
  assert.match(shader.fragmentShader, /#define RE_Direct FM_Direct/);
  assert.equal(Object.values(shader.uniforms).filter((u) => u.value?.isTexture).length, 6, "reuse native normal, AO, specular and sheen samplers");
});
