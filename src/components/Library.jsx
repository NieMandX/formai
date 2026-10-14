import { useRef } from "react";
import {
  Plus,
  FolderOpen,
  Link2,
  Trash2,
  Box,
  Layers3,
  PersonStanding,
  CircleHelp,
} from "lucide-react";
import { DEMOS } from "../scene/demos";
const marks = { knot: Layers3, architecture: Box, robot: PersonStanding };
export function Library({
  models,
  selected,
  onSelect,
  onFiles,
  onURL,
  onDelete,
  busy,
  onHelp,
  thumbnails = {},
}) {
  const input = useRef(),
    folder = useRef();
  const ids = new Set(DEMOS.map((d) => d.id)),
    rows = [
      ...DEMOS,
      ...models
        .filter((m) => !ids.has(m.id))
        .map((m) => ({
          ...m,
          subtitle: `${m.format} · ${m.animations ? `${m.animations} анимации` : "3D-модель"}`,
        })),
    ];
  return (
    <aside className="library panel" aria-label="Коллекция моделей">
      <div className="panel-heading">
        <h2>Коллекция</h2>
        <span className="count">{models.length} в комнате</span>
      </div>
      <button
        className="dropzone"
        disabled={busy}
        onClick={() => input.current.click()}
      >
        <Plus size={27} strokeWidth={1.5} />
        <strong>Добавить модель</strong>
        <span>GLB, glTF, FBX, OBJ, STL, PLY, DAE</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Файлы модели"
        onChange={(e) => {
          onFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
      <input
        ref={folder}
        type="file"
        webkitdirectory=""
        multiple
        hidden
        aria-label="Папка модели"
        onChange={(e) => {
          onFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
      <div className="import-options">
        <button disabled={busy} onClick={() => folder.current.click()}>
          <FolderOpen size={14} />
          Папка
        </button>
        <button disabled={busy} onClick={onURL}>
          <Link2 size={14} />
          По ссылке
        </button>
      </div>
      <div className="model-list">
        {rows.map((row) => {
          const Mark = marks[row.id] || Box,
            loaded = models.some((m) => m.id === row.id);
          return (
            <div
              className={`model-row ${selected === row.id ? "selected" : ""}`}
              key={row.id}
            >
              <button
                className="model-select"
                disabled={busy}
                onClick={() => onSelect(row.id)}
              >
                <span className={`model-thumb thumb-${row.id}`}>
                  {thumbnails[row.id] ? (
                    <img src={thumbnails[row.id]} alt="" />
                  ) : (
                    <Mark size={31} strokeWidth={1.3} />
                  )}
                </span>
                <span className="model-info">
                  <strong>{row.name}</strong>
                  <small>{row.subtitle}</small>
                </span>
                {loaded && <span className="live-dot" title="В комнате" />}
              </button>
              {loaded && (
                <button
                  className="delete-button icon-button"
                  aria-label={`Убрать ${row.name}`}
                  onClick={() => onDelete(row.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="local-note">
        <FolderOpen size={19} />
        <span>Локальные файлы</span>
        <p>
          Модели сохраняются в этом браузере. На другой шлем они автоматически
          не переносятся.
        </p>
        <button onClick={onHelp}>
          <CircleHelp size={14} />
          Как открыть на Quest 3
        </button>
      </div>
    </aside>
  );
}
