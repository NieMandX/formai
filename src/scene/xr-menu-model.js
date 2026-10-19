// Pixel-space layout shared by the spatial renderer and interaction tests.
import { REFERENCE_MODELS } from "../reference-catalog.js";
import { catalogView, personalModels } from "../library-catalog.js";
export const MENU = {
  width: 1440,
  height: 1080,
  worldWidth: 1.32,
  distance: 1.35,
};
export const TABS = [
  ["collection", "Коллекция", "box"],
  ["object", "Объект", "sliders"],
  ["animation", "Анимация", "play"],
  ["scene", "Сцена", "sun"],
];
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function hitControl(controls, x, y) {
  return (
    controls.findLast(
      (c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h,
    ) || null
  );
}
export function sliderValue(control, x) {
  const t = clamp((x - control.x - 28) / (control.w - 56), 0, 1);
  const value = control.min + t * (control.max - control.min);
  return clamp(
    control.step ? Math.round(value / control.step) * control.step : value,
    control.min,
    control.max,
  );
}
export function buildMenuLayout(state) {
  const controls = [],
    labels = [];
  const button = (id, text, x, y, w, h, extra = {}) =>
    controls.push({ id, text, x, y, w, h, type: "button", ...extra });
  const label = (text, x, y, size = 28, extra = {}) =>
    labels.push({ text, x, y, size, ...extra });
  const slider = (id, text, value, min, max, x, y, w, format, step) =>
    controls.push({
      id,
      text,
      value,
      min,
      max,
      x,
      y,
      w,
      h: 100,
      type: "slider",
      format,
      step,
      disabled: !state.model && id !== "exposure",
    });
  const model = state.model,
    settings = state.settings,
    tabs = state.ar ? [...TABS, ["drawing", "Рисование", "focus"]] : TABS;
  label("FORMAI", 38, 72, 40, { weight: 700, sidebar: true });
  label(state.ar ? "В ВАШЕЙ КОМНАТЕ" : "СТУДИЯ В VR", 40, 116, 20, { sidebar: true, muted: true });
  tabs.forEach(([id, text, icon], i) =>
    button("tab:" + id, text, 24, 178 + i * 126, 236, 102, {
      icon,
      sidebar: true,
      active: state.tab === id,
    }),
  );
  button("tab:help", "Управление", 24, 810, 236, 94, {
    icon: "help",
    sidebar: true,
    active: state.tab === "help",
  });
  button("exit", state.ar ? "Выйти из AR" : "Выйти из VR", 24, 936, 236, 94, {
    icon: "exit",
    sidebar: true,
  });
  button("recenter", "Передо мной", 1114, 34, 110, 88, {
    icon: "focus",
    iconOnly: true,
  });
  button("close", "Закрыть меню", 1250, 34, 110, 88, {
    icon: "close",
    iconOnly: true,
  });
  const title = tabs.find((t) => t[0] === state.tab)?.[1] || "Управление";
  label(title, 316, 82, 42, { weight: 650 });
  label(
    state.tab === "drawing" ? (state.drawing ? "Поза зафиксирована · можно рисовать" : "Разместите модели, затем зафиксируйте сцену") : state.tab === "collection"
      ? `${REFERENCE_MODELS.length} поз · ${state.models.length} из 12 моделей в комнате`
      : state.tab === "object" && model
        ? `${model.name} · ${(model.triangles || 0).toLocaleString("ru-RU")} треугольников`
        : model?.name || "Выберите модель в коллекции",
    318,
    132,
    25,
    { muted: true, maxWidth: 750 },
  );
  label("A / X — меню · B — материалы · Y — перед собой", 318, 1032, 23, {
    muted: true,
  });
  label(
    state.notice || (state.drawing ? "Сцена зафиксирована · A → Рисование → Снять фиксацию" : "Курок — выбрать · Боковая кнопка — захват"),
    318,
    982,
    24,
    { muted: !state.notice, maxWidth: 1040 },
  );
  if (state.confirm) {
    label(
      state.confirm.type === "delete"
        ? "Убрать модель?"
        : `Завершить ${state.ar ? "AR" : "VR"}-сеанс?`,
      330,
      320,
      40,
      { weight: 650 },
    );
    label(
      state.confirm.type === "delete"
        ? state.confirm.name
        : "Вы вернётесь к веб-версии студии.",
      330,
      390,
      29,
      { maxWidth: 980 },
    );
    label(
      state.confirm.type === "delete"
        ? state.confirm.reference
          ? "Поза останется в каталоге. Её можно открыть снова."
          : "Локальная сохранённая копия тоже будет удалена."
        : state.ar ? "Модели вернутся на свои места в виртуальной галерее." : "Модели останутся в текущей комнате.",
      330,
      460,
      25,
      { muted: true, maxWidth: 990 },
    );
    button("cancel", "Отмена", 330, 570, 470, 110);
    button(
      "confirm",
      state.confirm.type === "delete" ? "Убрать модель" : `Выйти из ${state.ar ? "AR" : "VR"}`,
      826,
      570,
      520,
      110,
      { danger: state.confirm.type === "delete", primary: true },
    );
    return {
      controls: controls.filter((c) => c.id === "cancel" || c.id === "confirm"),
      labels,
    };
  }
  if (state.tab === "drawing" && state.ar) {
    label("01   ВЫБЕРИТЕ И РАЗМЕСТИТЕ", 316, 216, 24, { muted: true });
    label("Art — позы для рисунка · Arch — объекты", 316, 264, 29);
    button("tab:collection", "Выбрать модель", 316, 306, 504, 100, { icon: "box" });
    button("drawing:place", "Поставить перед собой", 846, 306, 514, 100, { disabled: !model || state.drawing, icon: "focus" });
    label("Боковая кнопка — перенос и поворот рукой.", 316, 460, 27);
    label("Правый захват + стик ↑↓ — плавный масштаб.", 316, 506, 27);
    button("drawing:floor", "Опустить выбранную модель на пол", 316, 546, 1044, 94, { disabled: !model || state.drawing });
    label("02   ЗАФИКСИРУЙТЕ ДЛЯ РИСОВАНИЯ", 316, 704, 24, { muted: true });
    label("Анимация замрёт, панели и лучи скроются. A — вернуть меню.", 316, 752, 26, { maxWidth: 1044 });
    button("drawing:lock", state.drawing ? "Снять фиксацию" : "Зафиксировать для рисования", 316, 798, 1044, 116, {
      primary: true, icon: state.drawing ? "play" : "pause",
      disabled: !state.drawing && !state.models.length,
    });
  } else if (state.tab === "collection") {
    const view = catalogView(state.collectionPath, state.models),
      entries = view.entries,
      ownModels = personalModels(state.models);
    if (view.parent !== null) {
      button("folder:" + view.parent, view.parent === "art" ? "Назад в Art" : "Все папки", 316, 180, 270, 80, { icon: "left" });
      label(view.breadcrumbs.slice(1).map(c => c.name).join(" / "), 612, 229, 25, { maxWidth: 748, muted: true });
    } else {
      label("Каталог · 2 папки", 318, 229, 27, { muted: true });
      if (ownModels.length) button("folder:local", `Свои модели · ${ownModels.length}`, 1000, 180, 360, 80, { icon: "box" });
    }
    const pages = Math.max(1, Math.ceil(entries.length / 4)),
      page = clamp(state.page, 0, pages - 1);
    entries.slice(page * 4, page * 4 + 4).forEach((entry, i) => {
      const loaded = state.models.some(m => m.id === entry.id);
      button((entry.folder ? "folder:" : "model:") + entry.id, entry.name, 316, 282 + i * 122, 1044, 108, {
        modelId: entry.folder ? undefined : entry.id,
        active: !entry.folder && model?.id === entry.id,
        icon: entry.folder ? "folder" : "box",
        thumb: entry.folder ? undefined : entry.id,
        subtitle: entry.subtitle + (entry.folder ? "" : model?.id === entry.id ? " · выбрана" : loaded ? " · в комнате" : " · добавить"),
        disabled: !entry.folder && (state.busy || (state.drawing && !loaded)),
      });
    });
    if (!entries.length) label("Своих моделей в комнате нет", 342, 354, 30, { muted: true });
    button("page:prev", "Ранее", 316, 808, 242, 96, {
      targetPage: Math.max(0, page - 1),
      disabled: page === 0 || state.busy,
      icon: "left",
    });
    label(`${page + 1} / ${pages}`, 608, 868, 30, { muted: true });
    button("page:next", "Далее", 744, 808, 242, 96, {
      targetPage: Math.min(pages - 1, page + 1),
      disabled: page === pages - 1 || state.busy,
      icon: "right",
    });
    button("tab:object", "Свойства", 1012, 808, 348, 96, {
      disabled: !model,
      primary: true,
    });
  } else if (state.tab === "object") {
    slider(
      "scale",
      "Масштаб",
      Math.log(model?.scale || 1),
      Math.log(0.05),
      Math.log(10),
      316,
      204,
      1044,
      `${Math.round((model?.scale || 1) * 100)}%`,
    );
    slider(
      "rotation",
      "Вращение Y",
      model?.rotation || 0,
      -180,
      180,
      316,
      334,
      1044,
      `${Math.round(model?.rotation || 0)}°`,
      1,
    );
    label("ПОЛОЖЕНИЕ · МЕТРЫ", 316, 500, 23, { muted: true });
    ["x", "y", "z"].forEach((axis, i) => {
      const x = 316 + i * 356;
      label(axis.toUpperCase(), x + 12, 548, 27, { weight: 650 });
      label((model?.position[i] || 0).toFixed(2), x + 292, 548, 27, {
        align: "right",
      });
      button("position:" + axis + ":-1", "−", x, 574, 142, 90, {
        disabled: !model,
        icon: "minus",
        iconOnly: true,
      });
      button("position:" + axis + ":1", "+", x + 164, 574, 142, 90, {
        disabled: !model,
        icon: "plus",
        iconOnly: true,
      });
    });
    label("Масштаб: два захвата или правый захват + стик ↑↓", 316, 720, 24, {
      muted: true,
    });
    button("reset", state.ar ? "Сбросить перед собой" : "На пьедестал", 316, 764, 496, 96, {
      disabled: !model,
      icon: "reset",
    });
    button("inspect", state.ar ? "Поставить перед собой" : "Подойти к модели", 840, 764, 520, 96, {
      disabled: !model,
      icon: "focus",
    });
    button("delete", "Убрать из комнаты", 316, 882, 1044, 76, {
      disabled: !model,
      danger: true,
      icon: "trash",
    });
  } else if (state.tab === "animation") {
    const clips = model?.clips || [];
    if (!clips.length) {
      label("В этой модели нет анимации", 340, 340, 38, { weight: 650 });
      label("Выберите персонажа с встроенными клипами", 340, 406, 28, {
        muted: true,
      });
      label("или откройте демонстрационного робота.", 340, 452, 28, {
        muted: true,
      });
      button("model:robot", "Открыть робота", 340, 542, 988, 112, {
        primary: true,
        icon: "play",
        disabled: state.busy,
      });
    } else {
      label(`${model.bones} костей · ${clips.length} клипов`, 316, 202, 24, {
        muted: true,
      });
      const pages = Math.ceil(clips.length / 3),
        page = clamp(state.clipPage, 0, pages - 1);
      clips
        .slice(page * 3, page * 3 + 3)
        .forEach((clip, i) =>
          button(
            "clip:" + (page * 3 + i),
            clip.name,
            316,
            236 + i * 112,
            1044,
            94,
            {
              active: model.clip === page * 3 + i,
              icon: "play",
              subtitle: formatTime(clip.duration),
            },
          ),
        );
      button("clips:prev", "Назад", 316, 580, 230, 84, {
        disabled: page === 0,
        icon: "left",
      });
      label(`${page + 1} / ${pages}`, 610, 634, 28, { muted: true });
      button("clips:next", "Далее", 740, 580, 230, 84, {
        disabled: page === pages - 1,
        icon: "right",
      });
      button("playing", model.playing ? "Пауза" : "Играть", 996, 580, 364, 84, {
        primary: true,
        icon: model.playing ? "pause" : "play",
      });
      slider(
        "time",
        "Позиция клипа",
        model.time || 0,
        0,
        Math.max(0.001, clips[model.clip]?.duration || 0),
        316,
        684,
        1044,
        formatTime(model.time || 0),
      );
      slider(
        "speed",
        "Скорость",
        model.speed,
        0.25,
        2,
        316,
        814,
        1044,
        `${model.speed.toFixed(2).replace(/0$/, "")}×`,
        0.25,
      );
    }
  } else if (state.tab === "scene") {
    label("ОСВЕЩЕНИЕ PBR", 316, 206, 23, { muted: true });
    button("lighting:gallery", "Тёплая галерея", 316, 244, 504, 104, {
      active: settings.lighting === "gallery",
      icon: "sun",
    });
    button("lighting:neutral", "Нейтральная", 846, 244, 514, 104, {
      active: settings.lighting === "neutral",
      icon: "sun",
    });
    slider(
      "exposure",
      "Экспозиция",
      settings.exposure,
      0.4,
      1.8,
      316,
      392,
      1044,
      settings.exposure.toFixed(1),
      0.05,
    );
    button("grid", "Сетка пола", 316, 542, 1044, 104, {
      toggle: true,
      value: settings.grid,
      disabled: state.ar,
    });
    button("autoRotate", "Автовращение модели", 316, 670, 1044, 104, {
      toggle: true,
      value: settings.autoRotate,
      disabled: !model,
    });
    button("home", state.ar ? "К настройке рисования" : "Вернуться к входу", 316, 810, 1044, 104, { icon: "reset" });
  } else {
    [
      ["Курок", "Выбрать объект или нажать кнопку меню"],
      ["Боковая кнопка", "Захватить модель и перемещать рукой"],
      ["Два захвата", "Развести руки — масштаб; повернуть — вращение"],
      state.ar ? ["Ваша комната", "Обходите модель физически; ходьба стиками отключена"] : ["Левый стик вперёд", "Выбрать место на полу; отпустить — телепорт"],
      state.ar ? ["Рисование", "Фиксация останавливает позу; A возвращает меню"] : ["Правый стик", "Идти и поворачивать: сильнее наклон — быстрее"],
      ["Правый захват + стик ↑↓", "Вперёд — увеличить; назад — уменьшить модель"],
      ["A / X · B · Y", "Основное меню · материалы · вернуть панель"],
    ].forEach(([heading, body], i) => {
      label(heading, 316, 206 + i * 102, 29, { weight: 650 });
      label(body, 316, 246 + i * 102, 25, { muted: true, maxWidth: 1044 });
    });
    label(state.ar ? "Размещение в AR действует до завершения сеанса." : "Файлы добавляются в веб-версии до входа в VR.", 316, 940, 25, {
      muted: true,
    });
  }
  if (state.drawing)
    controls.forEach(c => {
      if (["scale", "rotation", "reset", "inspect", "playing", "speed", "time", "autoRotate"].includes(c.id)
          || c.id.startsWith("position:") || c.id.startsWith("clip:")) c.disabled = true;
    });
  if (state.busy)
    controls.forEach((c) => {
      if (!c.id.startsWith("tab:") && c.id !== "close" && c.id !== "recenter")
        c.disabled = true;
    });
  return { controls, labels };
}
export function formatTime(seconds) {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
