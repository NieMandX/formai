// Live controls use Spark's public properties; source files and LoD stay unchanged.
export const SPLAT_PAGES = ["Модель", "Контур", "Смешивание", "Детализация"];
export const SPLAT_CONTROLS = [
  { key: "opacity", label: "Непрозрачность", scope: "model", page: 0, min: 0, max: 2, step: .01, default: 1, unit: "percent", help: "0 — скрыта; 100% — исходная плотность." },
  { key: "brightness", label: "Яркость цвета", scope: "model", page: 0, min: 0, max: 3, step: .01, default: 1, unit: "gain", help: "Умножает записанный цвет только этой модели." },
  { key: "maxSh", label: "Детали цвета SH", scope: "model", page: 0, min: 0, max: 3, step: 1, default: 3, help: "0 — базовый цвет; 3 — все доступные детали, зависящие от ракурса." },
  { key: "maxStdDev", label: "Ширина мягкого контура", page: 1, min: 1, max: 4, step: .01, default: Math.sqrt(8), xrDefault: Math.sqrt(5), help: "Выше — больше полупрозрачных краёв и нагрузка." },
  { key: "minAlpha", label: "Порог прозрачности", page: 1, min: 0, max: .05, step: .0001, default: .5 / 255, unit: "threshold", help: "0 — без отсечения слабых сплатов. Выше — сильнее отсечение." },
  { key: "blurAmount", label: "Сглаживание мелких сплатов", page: 1, min: 0, max: 2, step: .01, default: .3, help: "Смягчает мелкие сплаты с поправкой их непрозрачности." },
  { key: "preBlurAmount", label: "Дополнительное размытие", page: 1, min: 0, max: 2, step: .01, default: 0, help: "Расширяет сплаты без поправки плотности; может уплотнять контур." },
  { key: "falloff", label: "Мягкость сплата", page: 2, min: 0, max: 1, step: .01, default: 1, help: "1 — плавное затухание; 0 — плоские пятна для сравнения." },
  { key: "focalAdjustment", label: "Резкость проекции", page: 2, min: .5, max: 2, step: .01, default: 1, unit: "gain", help: "Выше — резче, но возможны ступени и мерцание." },
  { key: "premultipliedAlpha", label: "Смешивание цвета", page: 2, type: "toggle", default: true, xrDefault: false, off: "Прямое", on: "Предумноженное", help: "Два способа накопления полупрозрачного цвета." },
  { key: "sortRadial", label: "Сортировка сплатов", page: 2, type: "toggle", default: true, off: "По глубине", on: "По расстоянию", help: "Сравните стабильность при движении и поворотах головы." },
  { key: "foveation", label: "Упрощение краёв поля зрения", page: 3, min: 0, max: 1, step: .05, default: .35, xrOnly: true, unit: "percent", help: "Только VR/AR: 0% — полная детализация по всему полю зрения." },
  { key: "maxPixelRadius", label: "Максимальный радиус сплата", page: 3, min: 32, max: 1024, step: 1, default: 512, unit: "px", help: "Предел размера отдельного сплата на экране." },
  { key: "minPixelRadius", label: "Отсечение мелких сплатов", page: 3, min: 0, max: 4, step: .01, default: 0, unit: "px", help: "0 — сохранять мелкие сплаты. Выше — часть деталей исчезает." },
  { key: "clipXY", label: "Запас за границами кадра", page: 3, min: 1, max: 2, step: .01, default: 1.4, unit: "gain", help: "Удерживает сплаты, чей центр уже за кадром, а край ещё виден." },
];
const STORAGE_KEY = "formai.splat-settings.v1";
const RENDER_CONTROLS = SPLAT_CONTROLS.filter(c => c.scope !== "model");
const MODEL_CONTROLS = SPLAT_CONTROLS.filter(c => c.scope === "model");
const defaults = immersive => Object.fromEntries(RENDER_CONTROLS
  .map(c => [c.key, immersive ? c.xrDefault ?? c.default : c.default]));
function bounded(c, value) {
  if (c.type === "toggle") return typeof value === "boolean" ? value : undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const clamped = Math.max(c.min, Math.min(c.max, value));
  return c.key === "maxSh" ? Math.round(clamped) : clamped;
}
export function formatSplatValue(c, value) {
  if (c.type === "toggle") return value ? c.on : c.off;
  const digits = c.unit === "threshold" ? 6 : c.key === "maxStdDev" ? 4 : c.key === "maxSh" ? 0 : 2;
  const number = value.toFixed(digits).replace(/\.?0+$/, "").replace(".", ",") || "0";
  if (c.unit === "percent") return `${Math.round(value * 100)}%`;
  return number + (c.unit === "gain" ? "×" : c.unit === "px" ? " px" : "");
}
export function createSplatAppearance(root) {
  const meshes = [];
  root.traverse(mesh => {
    if (mesh.userData.gaussianSplat && mesh.recolor) meshes.push({ mesh,
      color: mesh.recolor.clone(), opacity: mesh.opacity, maxSh: Math.min(3, mesh.splats?.getNumSh?.() ?? 3) });
  });
  return { meshes, values: { opacity: 1, brightness: 1, maxSh: Math.max(0, ...meshes.map(m => m.maxSh)) } };
}
function applyAppearance(appearance) {
  if (!appearance) return;
  for (const { mesh, color, opacity, maxSh } of appearance.meshes) {
    mesh.opacity = opacity * appearance.values.opacity;
    mesh.recolor.copy(color).multiplyScalar(appearance.values.brightness);
    const degree = Math.min(maxSh, appearance.values.maxSh);
    if (mesh.maxSh !== degree) { mesh.maxSh = degree; mesh.updateGenerator(); }
  }
}
export class SplatSettings {
  constructor(storage) {
    this.storage = storage;
    this.persistent = !!storage;
    this.modes = { screen: defaults(false), xr: defaults(true) };
    this.models = {};
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
      if (saved?.version === 1) {
        for (const mode of ["screen", "xr"]) for (const c of RENDER_CONTROLS) {
          const value = bounded(c, saved.modes?.[mode]?.[c.key]);
          if (value !== undefined) this.modes[mode][c.key] = value;
        }
        if (saved.models && typeof saved.models === "object") this.models = Object.fromEntries(Object.entries(saved.models).slice(-100));
      }
    } catch { this.persistent = false; }
  }
  persist() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, modes: this.modes, models: this.models })); }
    catch { this.persistent = false; }
  }
  attach(model) {
    model.splatAppearance = createSplatAppearance(model.root);
    for (const c of MODEL_CONTROLS) {
      const value = bounded(c, this.models[model.id]?.[c.key]);
      if (value !== undefined) model.splatAppearance.values[c.key] = value;
    }
    applyAppearance(model.splatAppearance);
  }
  state(model, immersive) {
    if (!model?.splats) return null;
    const values = { ...this.modes[immersive ? "xr" : "screen"], ...model.splatAppearance?.values };
    return { mode: immersive ? "xr" : "screen", persistent: this.persistent, values, controls: SPLAT_CONTROLS.map(c => {
      const value = values[c.key] ?? c.default;
      return { ...c, value, format: formatSplatValue(c, value), disabled: !!c.xrOnly && !immersive,
        reference: immersive ? c.xrDefault ?? c.default : c.default };
    }) };
  }
  set(model, key, value, immersive) {
    if (!model?.splats) return false;
    const c = SPLAT_CONTROLS.find(c => c.key === key);
    if (!c || (c.xrOnly && !immersive)) return false;
    value = bounded(c, value);
    if (value === undefined) return false;
    if (c.scope === "model") {
      if (!model.splatAppearance) return false;
      if (model.splatAppearance.values[key] === value) return false;
      model.splatAppearance.values[key] = value;
      applyAppearance(model.splatAppearance);
      this.models[model.id] = { ...model.splatAppearance.values };
      this.models = Object.fromEntries(Object.entries(this.models).slice(-100));
    } else {
      const mode = this.modes[immersive ? "xr" : "screen"];
      if (mode[key] === value) return false;
      mode[key] = value;
    }
    this.persist();
    return true;
  }
  reset(model, immersive) {
    if (!model?.splats) return;
    this.modes[immersive ? "xr" : "screen"] = defaults(immersive);
    if (model.splatAppearance) {
      model.splatAppearance.values = { opacity: 1, brightness: 1, maxSh: Math.max(0, ...model.splatAppearance.meshes.map(m => m.maxSh)) };
      applyAppearance(model.splatAppearance);
      delete this.models[model.id];
    }
    this.persist();
  }
  apply(spark, xr, immersive) {
    if (!spark) return;
    const values = this.modes[immersive ? "xr" : "screen"];
    for (const c of RENDER_CONTROLS) {
      if (c.xrOnly) continue;
      if (spark[c.key] !== values[c.key]) { spark[c.key] = values[c.key]; spark.setDirty(); }
    }
    if (immersive && xr.getFoveation() !== values.foveation) xr.setFoveation(values.foveation);
  }
  report(model, immersive) {
    return JSON.stringify({ version: 1, model: model?.name, modelId: model?.id,
      currentMode: immersive ? "VR / AR" : "Экран", appearance: model?.splatAppearance?.values,
      screenRenderer: this.modes.screen, xrRenderer: this.modes.xr }, null, 2);
  }
}
