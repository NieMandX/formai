import * as T from "three";

// A multiplier of one must preserve the loaded asset, including its authored
// normal handedness, transparent eyes and FORMAI's softened skin shader.
const native = {
  map: ["Основной цвет", [1, 1, 1, 1]],
  normalMap: ["Нормали · рельеф", [.5, .5, 1, 1]],
  bumpMap: ["Высота · рельеф", [0, 0, 0, 1]],
  roughnessMap: ["Шероховатость", [1, 1, 1, 1]],
  metalnessMap: ["Металличность", [1, 1, 1, 1]],
  aoMap: ["Затенение · AO", [1, 1, 1, 1]],
  emissiveMap: ["Свечение", [1, 1, 1, 1]],
  alphaMap: ["Прозрачность", [1, 1, 1, 1]],
  lightMap: ["Запечённый свет", [0, 0, 0, 1]],
  specularColorMap: ["Цвет отражений", [1, 1, 1, 1]],
  specularIntensityMap: ["Сила отражений", [1, 1, 1, 1]],
  sheenColorMap: ["Бархатистость", [1, 1, 1, 1]],
  sheenRoughnessMap: ["Шероховатость ворса", [1, 1, 1, 1]],
  clearcoatMap: ["Лаковое покрытие", [1, 1, 1, 1]],
  clearcoatRoughnessMap: ["Шероховатость лака", [1, 1, 1, 1]],
  clearcoatNormalMap: ["Рельеф лака", [.5, .5, 1, 1]],
  transmissionMap: ["Пропускание света", [1, 1, 1, 1]],
  thicknessMap: ["Толщина", [1, 1, 1, 1]],
  iridescenceMap: ["Переливы", [1, 1, 1, 1]],
  iridescenceThicknessMap: ["Толщина плёнки", [1, 1, 1, 1]],
  anisotropyMap: ["Анизотропия", [1, .5, 1, 1]],
  displacementMap: ["Смещение геометрии", [0, 0, 0, 1]],
};
const source = {
  _BumpTex: ["Нормали · рельеф", "normalMap", [.5, .5, 1, 1]],
  _BumpMap: ["Нормали · рельеф", "normalMap", [.5, .5, 1, 1]],
  _OcclusionTex: ["Затенение · AO и впадины", "aoMap", [1, 1, .5, 1]],
  _SpecTex: ["Отражения и шероховатость", "specularColorMap", [1, 1, 1, 1]],
  _WetSpecTex: ["Отражения влажной кожи", "fm_WetSpecTex", [1, 1, 1, 1]],
  _WetBlendTex: ["Маска влажности", "fm_WetBlendTex", [0, 0, 0, 0]],
  _BSSRDF: ["Рассеивание света в коже", "fm_BSSRDF", [1, 1, 1, 1]],
  _SSSColor: ["Цвет просвечивания", "fm_SSSColor", [0, 0, 0, 1]],
  _MicroMixMap: ["Маска микрорельефа", "fm_MicroMixMap", [1, 0, 0, 1]],
  _microTex1: ["Микрорельеф · слой 1", "fm_microTex1", [.5, .5, 1, 1]],
  _microTex3: ["Микрорельеф · слой 2", "fm_microTex3", [.5, .5, 1, 1]],
  _velvetMask: ["Маска бархатистости", "sheenColorMap", [0, 0, 0, 1]],
};

export function availableMaps(material) {
  const maps = [], aliases = new Set();
  for (const [slot, [label, sampler, neutral]] of Object.entries(source)) {
    if (!material[`formaiMap${slot}`]) continue;
    aliases.add(sampler);
    const detail = slot === "_microTex1" && material.userData.formaiMaterial?.kind === "detail";
    maps.push({ id: slot, label: detail ? "Детальная текстура" : label,
      sampler, neutral: detail ? [.5, .5, .5, 1] : neutral });
  }
  for (const [sampler, [label, neutral]] of Object.entries(native)) {
    if (material[sampler]?.isTexture && !aliases.has(sampler))
      maps.push({ id: sampler, label, sampler, neutral });
  }
  return maps.sort((a, b) => (a.id === "map" ? -1 : b.id === "map" ? 1 : 0));
}

function expandChunks(text) {
  return text.replace(/#include <([\w\d_]+)>/g, (match, name) =>
    T.ShaderChunk[name] === undefined ? match : expandChunks(T.ShaderChunk[name]));
}

function installGains(material, controls) {
  const before = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    for (const stage of ["fragmentShader", "vertexShader"]) {
      let code = expandChunks(shader[stage]);
      let declarations = "", definitions = "";
      for (const [i, control] of controls.entries()) {
        const { sampler, neutral, uniform } = control;
        const name = `fmMapGain${i}`, fn = `fmMapSample${i}`;
        shader.uniforms[name] = uniform;
        const pattern = new RegExp(`texture2D\\(\\s*${sampler}\\s*,`, "g");
        if (!pattern.test(code)) continue;
        code = code.replace(pattern, `${fn}(`);
        // Native samplers may be absent from the active shader variant (e.g.
        // sheen=0); custom FORMAI samplers are always explicitly declared.
        const guard = native[sampler] ? `USE_${sampler.replace(/(Color|Intensity|Roughness|Normal|Thickness)Map$/, "_$1Map").toUpperCase()}` : null;
        const wrap = (text) => guard ? `\n#ifdef ${guard}\n${text}\n#endif\n` : text;
        declarations += wrap(`uniform float ${name};\nvec4 ${fn}(vec2 uv);`);
        const base = `vec4(${neutral.map(n => Number(n).toFixed(1)).join(", ")})`;
        // Keep alpha coverage on the base-colour map: turning colour off must
        // never paint opaque rectangles over eyelashes or transparent corneas.
        const sample = `vec4 s = texture2D(${sampler}, uv);\nif (${name} == 1.0) return s;`;
        const blend = `mix(${base}, s, ${name})`;
        const value = /normalMap|NormalMap|_microTex[13]/.test(sampler)
          && material.userData.formaiMaterial?.kind !== "detail"
          ? blend : `clamp(${blend}, 0.0, 1.0)`;
        definitions += wrap(`vec4 ${fn}(vec2 uv) { ${sample}\nvec4 result = ${value};\n${sampler === "map" ? "result.a = s.a;" : ""}\nreturn result; }`);
        if (control.id === "_BSSRDF")
          code = code.replace("softened, fmScattering)", `softened, fmScattering * min(${name}, 1.0))`);
        if (sampler === "displacementMap")
          code = code.replace("+ displacementBias", `+ displacementBias * ${name}`);
      }
      shader[stage] = declarations + "\n" + code + "\n" + definitions;
    }
  };
  material.customProgramCacheKey = () => cacheKey + ":formai-map-gains-v1:" +
    controls.map(c => `${c.id}/${c.sampler}`).join(",");
  material.needsUpdate = true;
}

export function createMaterialControls(root) {
  const unique = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      if (m?.isMeshStandardMaterial) unique.add(m);
  });
  return [...unique].map((material, index) => {
    const controls = availableMaps(material).map(c => ({ ...c, uniform: { value: 1 } }));
    if (controls.length) installGains(material, controls);
    return { id: String(index), name: material.name || `Материал ${index + 1}`, controls };
  });
}

export function materialControlState(entries = [], target = "all") {
  const groups = target === "all" ? entries : entries.filter(e => e.id === target);
  const combined = new Map();
  for (const entry of groups) for (const c of entry.controls) {
    const id = native[c.sampler] ? c.sampler : c.id;
    const found = combined.get(id);
    if (found) found.mixed ||= Math.abs(found.value - c.uniform.value) > 1e-6;
    else combined.set(id, { id, label: c.label, value: c.uniform.value, mixed: false });
  }
  return { materials: entries.map(e => ({ id: e.id, name: e.name })), maps: [...combined.values()] };
}

export function setMapGain(entries, target, id, value) {
  if (!Number.isFinite(value)) return false;
  let changed = false;
  for (const entry of entries) {
    if (target !== "all" && entry.id !== target) continue;
    const c = entry.controls.find(c => c.id === id || c.sampler === id);
    if (c) { c.uniform.value = T.MathUtils.clamp(value, 0, 10); changed = true; }
  }
  return changed;
}

export function resetMapGains(entries, target = "all") {
  for (const entry of entries)
    if (target === "all" || entry.id === target)
      for (const c of entry.controls) c.uniform.value = 1;
}
