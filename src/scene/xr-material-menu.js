import { clamp } from "./xr-menu-model.js";
import { buildSplatMenuLayout } from "./xr-splat-menu.js";

// Same ray/trigger interaction as the main panel, without global scene controls.
export function buildMaterialMenuLayout(state) {
  if (state.model?.splats && state.splatSettings) return buildSplatMenuLayout(state);
  const controls = [], labels = [], model = state.model;
  const button = (id, text, x, y, w, h, extra = {}) =>
    controls.push({ id, text, x, y, w, h, type: "button", ...extra });
  const label = (text, x, y, size, extra = {}) => labels.push({ text, x, y, size, ...extra });
  label("МАТЕРИАЛЫ", 48, 72, 40, { weight: 650 });
  label(model?.name || "Нет выбранной модели", 48, 128, 30, { muted: true, maxWidth: 1030 });
  button("recenter", "Передо мной", 1144, 34, 104, 88, { icon: "focus", iconOnly: true });
  button("close", "Закрыть материалы", 1270, 34, 104, 88, { icon: "close", iconOnly: true });
  if (!model) {
    label("Выберите загруженную модель курком", 48, 340, 36);
    label("или откройте коллекцию кнопкой A.", 48, 400, 30, { muted: true });
    label("B — закрыть материалы · A — основное меню", 48, 1038, 25, { muted: true });
    return { controls, labels };
  }
  const entries = [{ id: "all", name: "Все материалы" }, ...state.materials];
  const index = Math.max(0, entries.findIndex(m => m.id === state.materialTarget));
  button("material:prev", "Предыдущий материал", 48, 192, 100, 88,
    { icon: "left", iconOnly: true, disabled: state.busy || index === 0 });
  button("material:next", "Следующий материал", 1274, 192, 100, 88,
    { icon: "right", iconOnly: true, disabled: state.busy || index === entries.length - 1 });
  label(entries[index].name, 184, 226, 32, { weight: 650, maxWidth: 1040 });
  label(`${index + 1} / ${entries.length} · Доступных карт: ${state.maps.length}`, 184, 268, 24, { muted: true });
  const pages = Math.max(1, Math.ceil(state.maps.length / 4));
  const page = clamp(state.materialPage, 0, pages - 1);
  state.maps.slice(page * 4, page * 4 + 4).forEach((map, i) => {
    controls.push({ id: "map:" + map.id, text: map.label, type: "slider",
      x: 48, y: 316 + i * 126, w: 1326, h: 100, min: 0, max: 10, step: .05,
      value: map.value, format: map.mixed ? "Разные" : map.value.toFixed(2).replace(".", ",") + "×",
      modelId: model.id, target: state.materialTarget, disabled: state.busy, reference: 1 });
  });
  if (!state.maps.length) {
    label(model.splats ? "Gaussian Splatting · исходный вид" : "В этом материале нет карт", 48, 402, 36);
    label(model.splats ? "Цвет и свет записаны в сплатах. PBR-карт нет." : "Он использует цвет и параметры материала.", 48, 464, 28, { muted: true });
  }
  button("maps:prev", "Назад", 48, 834, 260, 80,
    { icon: "left", disabled: state.busy || page === 0, targetPage: page - 1 });
  label(`Карты · ${page + 1} / ${pages}`, 712, 885, 28, { align: "center", muted: true });
  button("maps:next", "Далее", 1114, 834, 260, 80,
    { icon: "right", disabled: state.busy || page === pages - 1, targetPage: page + 1 });
  button("maps:reset", "Сбросить карты · 1×", 48, 936, 636, 80,
    { icon: "reset", disabled: state.busy || !state.maps.length });
  button("unload", "Выгрузить из комнаты", 708, 936, 666, 80,
    { icon: "trash", danger: true, disabled: state.busy, modelId: model.id });
  label(state.busy ? "Дождитесь загрузки модели…" : "0 — без карты · 1 — исходный вид · B — закрыть · A — меню", 48, 1052, 25, { muted: true });
  return { controls, labels };
}
