export const MODEL_EXTENSIONS = [
  "glb",
  "gltf",
  "fbx",
  "obj",
  "stl",
  "ply",
  "dae",
];
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_BUNDLE_BYTES = 250 * 1024 * 1024;
export function extension(name) {
  return name.split(/[?#]/)[0].split(".").pop().toLowerCase();
}
export function normalizedPath(path) {
  const parts = decodeURIComponent(path).replaceAll("\\", "/").split("/");
  const result = [];
  for (const part of parts) {
    if (part === "..") result.pop();
    else if (part && part !== ".") result.push(part);
  }
  return result.join("/");
}
export function validateFiles(files) {
  if (!files.length) throw new Error("Выберите файлы модели.");
  if (files.some((f) => f.size > MAX_FILE_BYTES))
    throw new Error(
      "Один файл не должен превышать 100 МБ. Для Quest лучше оптимизировать модель.",
    );
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BUNDLE_BYTES)
    throw new Error("Общий размер файлов превышает 250 МБ.");
  const models = files.filter((f) =>
    MODEL_EXTENSIONS.includes(extension(f.name)),
  );
  if (!models.length)
    throw new Error(
      "Поддерживаются GLB, glTF, FBX, OBJ, STL, PLY и DAE. Добавьте текстуры и .bin вместе с моделью.",
    );
  return models;
}
export function validateModelURL(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Используйте прямую HTTPS-ссылку на модель.");
  if (!MODEL_EXTENSIONS.includes(extension(url.pathname)))
    throw new Error(
      "Ссылка должна вести на .glb, .gltf, .fbx, .obj, .stl, .ply или .dae.",
    );
  return url;
}
export const clampScale = (value) =>
  Math.max(0.05, Math.min(10, Number(value) || 1));
