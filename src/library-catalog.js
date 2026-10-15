import { REFERENCE_MODELS, referenceDetail } from "./reference-catalog.js";

export const DEMO_MODELS = [
  { id: "robot", name: "Робот", subtitle: "11 костей · 3 анимации", format: "GLB", demo: true },
  { id: "architecture", name: "Архитектура", subtitle: "Свет и пространство", format: "DEMO", demo: true },
  { id: "knot", name: "Узел", subtitle: "Форма и PBR-материал", format: "DEMO", demo: true },
];

// Keep the original source directory names, independent of generated asset URLs.
export const ART_FOLDERS = [
  ["ariel", "VRGirlz-09-Ariel-BVR-v1.5"],
  ["nat18", "VRGirlz-18-Nat-AVR-v1.5"],
  ["nat21", "VRGirlz-21-Nat-AVR-v1.5"],
  ["chloe", "VRGirlz-22-Chloe-BVR-v1.5"],
  ["lucid", "VRGirlz-Lucid-Dreams-II-v1.5"],
].map(([key, name]) => ({
  id: `art/${key}`, name, folder: true, parent: "art",
  models: REFERENCE_MODELS.filter(m => m.id.startsWith(`reference-${key}-`))
    .map(m => ({ ...m, reference: true, subtitle: referenceDetail(m) })),
}));

const roots = [
  { id: "art", name: "Art", folder: true, parent: "", subtitle: `${REFERENCE_MODELS.length} модели · ${ART_FOLDERS.length} папок` },
  { id: "arch", name: "Arch", folder: true, parent: "", subtitle: "Робот, архитектура и узел · 3 модели" },
];
const builtInIds = new Set([...REFERENCE_MODELS, ...DEMO_MODELS].map(m => m.id));
const folders = new Map([...roots, ...ART_FOLDERS].map(f => [f.id, f]));

export const personalModels = (models) => models.filter(m => !builtInIds.has(m.id));

// Both desktop and VR use the same tree; navigation never loads or unloads a model.
export function catalogView(path = "", models = []) {
  const folder = folders.get(path);
  if (path === "local") return {
    path, name: "Свои модели", parent: "", breadcrumbs: [{ id: "", name: "Каталог" }, { id: path, name: "Свои модели" }],
    entries: personalModels(models).map(m => ({ ...m, subtitle: `${m.format} · ${m.animations || 0} анимаций` })),
  };
  if (!folder) return {
    path: "", name: "Каталог", parent: null,
    breadcrumbs: [{ id: "", name: "Каталог" }], entries: roots,
  };
  return {
    path, name: folder.name, parent: folder.parent,
    breadcrumbs: [
      { id: "", name: "Каталог" },
      ...(folder.parent ? [{ id: "art", name: "Art" }] : []),
      { id: path, name: folder.name },
    ],
    entries: path === "art"
      ? ART_FOLDERS.map(f => ({ ...f, subtitle: `Поз: ${f.models.length} · исходная коллекция` }))
      : path === "arch" ? DEMO_MODELS : folder.models,
  };
}
