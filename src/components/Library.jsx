import { useRef, useState } from "react";
import {
  Plus,
  FolderOpen,
  Link2,
  Trash2,
  Box,
  Layers3,
  PersonStanding,
  CircleHelp,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { catalogView, personalModels, ART_MODEL_COUNT } from "../library-catalog.js";
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
  const [path, setPath] = useState("");
  const view = catalogView(path, models), ownModels = personalModels(models);
  const loadedIds = new Set(models.map(m => m.id));
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
      <nav className="catalog-breadcrumbs" aria-label="Путь в каталоге">
        {view.breadcrumbs.map((crumb, i) => (
          <span key={crumb.id}>
            {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
            {i === view.breadcrumbs.length - 1 ? (
              <strong aria-current="page">{crumb.name}</strong>
            ) : <button onClick={() => setPath(crumb.id)}>{crumb.name}</button>}
          </span>
        ))}
      </nav>
      {view.parent !== null && <button className="catalog-back" onClick={() => setPath(view.parent)}>
        <ArrowLeft size={15} />{view.parent === "art" ? "Назад в Art" : "Все папки"}
      </button>}
      <div className="model-list" aria-label={view.name}>
        {view.entries.map((row) => {
          if (row.folder) return (
            <button className={`catalog-folder ${row.parent ? "source-folder" : ""}`} key={row.id}
              onClick={() => setPath(row.id)} aria-label={`Открыть папку ${row.name}`}>
              <span className="folder-mark"><FolderOpen size={25} strokeWidth={1.4} /></span>
              <span className="folder-info"><strong>{row.name}</strong><small>{row.subtitle}</small></span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          );
          const Mark = marks[row.id] || (row.reference ? PersonStanding : Box),
            loaded = loadedIds.has(row.id);
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
        {view.path === "local" && !view.entries.length && <p className="catalog-empty">Сейчас своих моделей в комнате нет. Добавьте файл или откройте его по ссылке.</p>}
      </div>
      {!view.path && ownModels.length > 0 && <button className="catalog-personal" onClick={() => setPath("local")}>
        <Box size={16} /><span>Свои модели <small>{ownModels.length}</small></span><ChevronRight size={15} />
      </button>}
      <div className="local-note">
        <FolderOpen size={19} />
        <span>Моделей в Art: {ART_MODEL_COUNT}</span>
        <p>
          Вся коллекция доступна на Quest 3. Выбранная поза загружается с
          исходной детализацией и добавляется к моделям в комнате.
          Свои файлы сохраняются только в этом браузере.
        </p>
        <button onClick={onHelp}>
          <CircleHelp size={14} />
          Как открыть на Quest 3
        </button>
      </div>
    </aside>
  );
}
