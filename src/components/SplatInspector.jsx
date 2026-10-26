import { useState } from "react";
import { SPLAT_PAGES } from "../scene/splat-settings.js";

export function SplatInspector({ model, viewer }) {
  const [page, setPage] = useState(0), [copyState, setCopyState] = useState("");
  const [report, setReport] = useState("");
  const settings = model.splatSettings;
  if (!settings) return null;
  const controls = settings.controls.filter(c => c.page === page);
  return <fieldset>
    <legend>Вид сплат-модели</legend>
    <label className="field-label" htmlFor="splat-page">Настройки отображения</label>
    <select id="splat-page" value={page} onChange={e => { setPage(+e.target.value); setCopyState(""); }}>
      {SPLAT_PAGES.map((name, i) => <option key={name} value={i}>{name}</option>)}
    </select>
    <p className="animation-note">{page === 0 ? "Только эта модель" : "Все сплат-модели · настройки экрана"}</p>
    {controls.map(c => <div key={c.key}>
      {c.type === "toggle" ? <>
        <label className="field-label" htmlFor={"splat-" + c.key}>{c.label}</label>
        <select id={"splat-" + c.key} value={String(c.value)} disabled={c.disabled}
          onChange={e => viewer.setSplatSetting(c.key, e.target.value === "true", model.id)}>
          <option value="false">{c.off}</option><option value="true">{c.on}</option>
        </select>
      </> : <>
        <label className="range-label" htmlFor={"splat-" + c.key}>{c.label} <output>{c.format}</output></label>
        <input id={"splat-" + c.key} type="range" min={c.min} max={c.max} step={c.step} value={c.value} disabled={c.disabled}
          onChange={e => viewer.setSplatSetting(c.key, +e.target.value, model.id)} />
      </>}
      <p className="animation-note">{c.help}</p>
    </div>)}
    <button className="secondary reset" onClick={() => { viewer.resetSplatSettings(model.id); setCopyState(""); }}>Сбросить настройки</button>
    <button className="secondary reset" onClick={async () => {
      const text = viewer.splatSettingsReport();
      setReport(text);
      try { await navigator.clipboard.writeText(text); setCopyState("copied"); }
      catch { setCopyState("manual"); }
    }}>Скопировать значения экрана и VR</button>
    {copyState === "copied" && <p role="status" className="animation-note">Значения скопированы — можно отправить их в чат.</p>}
    {copyState && <details open={copyState === "manual"}>
      <summary>Показать значения для копирования</summary>
      <textarea aria-label="Значения настроек сплатов" readOnly value={report} rows={8} style={{ width: "100%" }} />
    </details>}
    <p className="animation-note">{settings.persistent ? "Сохраняется на этом устройстве." : "Доступно до закрытия страницы."} В VR и AR — панель рядом с фигурой, кнопка B. Настройки экрана и шлема раздельные.</p>
  </fieldset>;
}
