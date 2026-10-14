import { RotateCcw, Play, Pause, Sparkles } from "lucide-react";
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle" />
    </label>
  );
}
export function Inspector({ model, viewer, settings, setSettings }) {
  const update = (key, value) => {
    if (viewer) viewer.setSceneSetting(key, value);
    else setSettings((s) => ({ ...s, [key]: value }));
  };
  return (
    <aside className="inspector panel" aria-label="Свойства модели">
      <div className="object-heading">
        <h2>{model?.name || "Нет модели"}</h2>
        <p>
          {model
            ? model.format === "DEMO"
              ? "Демонстрационная модель"
              : model.reference
                ? "Референс · 8K · максимальное качество"
              : `${model.format} · локальная коллекция`
            : "Добавьте модель в коллекцию"}
        </p>
      </div>
      <fieldset disabled={!model}>
        <legend>Трансформация</legend>
        <label className="range-label" htmlFor="scale">
          Масштаб <output>{Math.round((model?.scale || 1) * 100)}%</output>
        </label>
        <input
          id="scale"
          aria-label="Масштаб"
          type="range"
          min="-2.996"
          max="2.303"
          step=".01"
          value={Math.log(model?.scale || 1)}
          onChange={(e) => viewer?.setScale(Math.exp(+e.target.value))}
        />
        <label className="field-label">Позиция (X, Y, Z)</label>
        <div className="coordinates">
          {["x", "y", "z"].map((axis, i) => (
            <label key={axis}>
              <span>{axis.toUpperCase()}</span>
              <input
                aria-label={`Позиция ${axis.toUpperCase()}`}
                type="number"
                min="-8"
                max="8"
                step=".1"
                value={+(model?.position[i] || 0).toFixed(2)}
                onChange={(e) => viewer?.setPosition(axis, +e.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="range-label" htmlFor="rotation">
          Вращение (Y) <output>{Math.round(model?.rotation || 0)}°</output>
        </label>
        <input
          id="rotation"
          type="range"
          min="-180"
          max="180"
          value={model?.rotation || 0}
          onChange={(e) => viewer?.setRotation(+e.target.value)}
        />
        <button
          className="secondary reset"
          onClick={() => viewer?.resetSelected()}
        >
          <RotateCcw size={15} />
          На пьедестал
        </button>
      </fieldset>
      <fieldset disabled={!model?.clips.length}>
        <legend>
          Анимация{" "}
          <span>
            {model?.clips.length ? `${model.clips.length} клипа` : ""}
          </span>
        </legend>
        <label className="field-label" htmlFor="clip">
          Клип анимации
        </label>
        <div className="playback">
          <button
            className="secondary icon-button"
            aria-label={model?.playing ? "Пауза" : "Воспроизвести"}
            onClick={() => viewer?.setPlaying(!model.playing)}
          >
            {model?.playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <select
            id="clip"
            value={model?.clip || 0}
            onChange={(e) => viewer?.setClip(+e.target.value)}
          >
            {model?.clips.length ? (
              model.clips.map((c, i) => (
                <option key={i} value={i}>
                  {c.name}
                </option>
              ))
            ) : (
              <option value={0}>Нет анимаций</option>
            )}
          </select>
        </div>
        <label className="range-label" htmlFor="speed">
          Скорость{" "}
          <output>{(model?.speed || 1).toFixed(2).replace(/0$/, "")}×</output>
        </label>
        <input
          id="speed"
          type="range"
          min=".25"
          max="2"
          step=".25"
          value={model?.speed || 1}
          onChange={(e) => viewer?.setSpeed(+e.target.value)}
        />
        {model?.bones > 0 && (
          <p className="animation-note">
            <Sparkles size={12} />
            {model.bones} костей · скелетная анимация
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>Свет и сцена</legend>
        <label className="field-label" htmlFor="lighting">
          Освещение PBR
        </label>
        <select
          id="lighting"
          value={settings.lighting}
          onChange={(e) => update("lighting", e.target.value)}
        >
          <option value="gallery">Тёплая галерея</option>
          <option value="neutral">Нейтральная студия</option>
        </select>
        <label className="range-label" htmlFor="exposure">
          Экспозиция <output>{settings.exposure.toFixed(1)}</output>
        </label>
        <input
          id="exposure"
          type="range"
          min=".4"
          max="1.8"
          step=".1"
          value={settings.exposure}
          onChange={(e) => update("exposure", +e.target.value)}
        />
        <Toggle
          label="Сетка пола"
          checked={settings.grid}
          onChange={(v) => update("grid", v)}
        />
        <Toggle
          label="Автовращение"
          checked={settings.autoRotate}
          onChange={(v) => update("autoRotate", v)}
        />
      </fieldset>
      {model && (
        <p className="model-stats">
          {model.triangles.toLocaleString("ru-RU")} треугольников
          {model.triangles > 300000 ? " · тяжёлая модель для VR" : ""}
        </p>
      )}
    </aside>
  );
}
