import * as T from "three";
import { SPLAT_PAGES } from "./splat-settings.js";

export function buildSplatMenuLayout(state) {
  const controls = [], labels = [], model = state.model, page = Math.max(0, Math.min(3, state.splatPage || 0));
  const button = (id, text, x, y, w, h, extra = {}) => controls.push({ id, text, x, y, w, h, type: "button", ...extra });
  const label = (text, x, y, size, extra = {}) => labels.push({ text, x, y, size, ...extra });
  label("ВИД СПЛАТ-МОДЕЛИ", 48, 72, 38, { weight: 650 });
  label(model.name, 48, 128, 28, { muted: true, maxWidth: 1030 });
  button("recenter", "Передо мной", 1144, 34, 104, 88, { icon: "focus", iconOnly: true });
  button("close", "Закрыть настройки", 1270, 34, 104, 88, { icon: "close", iconOnly: true });
  SPLAT_PAGES.forEach((name, i) => button("splat:page:" + i, name, 48 + i * 338, 190, 312, 80, { active: page === i }));
  label(page === 0 ? "Только выбранная модель" : "Все сплат-модели в комнате · VR / AR", 48, 314, 26, { muted: true });
  const entries = state.splatSettings?.controls.filter(c => c.page === page) || [];
  entries.forEach((c, i) => {
    const y = 344 + i * 120, disabled = state.busy || c.disabled;
    if (c.type === "toggle") button("splat:toggle:" + c.key, `${c.label}: ${c.format}`, 48, y + 5, 1326, 88,
      { active: c.value, disabled, modelId: model.id });
    else controls.push({ ...c, id: "splat:value:" + c.key, text: c.label,
      x: 48, y, w: 1326, h: 100, type: "slider", modelId: model.id, disabled });
  });
  const detail = state.splatHint || (page === 0 ? "100% и 1× — исходный вид · SH 3 — все детали цвета" : page === 1
    ? "Порог 0 — без отсечения · выше размытие — мягче и плотнее контур"
    : page === 2 ? "Меняйте по одному параметру и сравнивайте контур фигуры"
    : "Упрощение поля зрения: 0% — полное разрешение, 100% — максимум");
  label(detail, 48, 866, 24, { muted: true, maxWidth: 1326 });
  button("splat:reset", "Сбросить настройки", 48, 910, 636, 80, { icon: "reset", disabled: state.busy, modelId: model.id });
  button("unload", "Выгрузить из комнаты", 708, 910, 666, 80, { icon: "trash", danger: true, disabled: state.busy, modelId: model.id });
  label((state.splatSettings?.persistent ? "Сохранено на устройстве" : "Настройки до закрытия страницы") + " · B — панель · A — меню", 48, 1046, 25, { muted: true });
  return { controls, labels };
}

// Stable world-space placement: follows model transforms, not head movement.
export function placeSplatPanel(group, model, camera, width) {
  model.wrapper.updateWorldMatrix(true, true);
  const box = new T.Box3().setFromObject(model.wrapper), center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
  if (box.isEmpty()) return false;
  const head = camera.getWorldPosition(new T.Vector3()), forward = center.clone().sub(head);
  forward.y = 0;
  if (forward.lengthSq() < .01) forward.set(0, 0, -1);
  forward.normalize();
  const right = new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0));
  const radius = (Math.abs(right.x) * size.x + Math.abs(right.z) * size.z) / 2;
  group.position.copy(center).addScaledVector(right, radius + width / 2 + .16).addScaledVector(forward, -.12);
  group.position.y = Math.max(.7, Math.min(head.y - .12, box.max.y));
  group.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
  group.updateMatrixWorld(true);
  return true;
}
