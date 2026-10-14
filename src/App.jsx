import { useEffect, useRef, useState } from "react";
import {
  Box,
  Headset,
  CircleHelp,
  Focus,
  ZoomIn,
  ZoomOut,
  Maximize,
  Info,
  X,
  MousePointer2,
  PanelLeftClose,
  SlidersHorizontal,
  LoaderCircle,
} from "lucide-react";
import { Viewer } from "./scene/Viewer";
import { Library } from "./components/Library";
import { Inspector } from "./components/Inspector";
import { Help, URLDialog } from "./components/Dialogs";
import {
  extension,
  validateFiles,
  validateModelURL,
  MODEL_EXTENSIONS,
} from "./model-utils";
import { savedModels, saveModel, deleteModel } from "./storage";

export default function App() {
  const canvas = useRef(),
    viewer = useRef();
  const [snapshot, setSnapshot] = useState({
    models: [],
    selected: null,
    immersive: false,
  });
  const [settings, setSettings] = useState({
    grid: true,
    autoRotate: false,
    lighting: "gallery",
    exposure: 1,
  });
  const [busy, setBusy] = useState(""),
    [message, setMessage] = useState(null),
    [dialog, setDialog] = useState(null),
    [fatal, setFatal] = useState(""),
    [xr, setXR] = useState(false),
    [dragging, setDragging] = useState(false),
    [mobilePanel, setMobilePanel] = useState("none");
  const working = useRef(false);
  const notify = (text, error = false) => setMessage({ text, error });
  useEffect(() => {
    let alive = true,
      v;
    try {
      v = new Viewer(canvas.current, (s) => {
        if (alive) {
          setSnapshot(s);
          if (s.settings) setSettings(s.settings);
        }
      });
      viewer.current = v;
      v.onDeleteRequest = remove;
      if (import.meta.env.DEV) window.__forma = v;
    } catch (error) {
      setFatal(
        `Не удалось запустить 3D: ${error.message}. Проверьте WebGL 2 и аппаратное ускорение браузера.`,
      );
      return;
    }
    navigator.xr
      ?.isSessionSupported("immersive-vr")
      .then((supported) => {
        if (alive) setXR(supported);
      })
      .catch(() => {});
    working.current = true;
    setBusy("Открываем вашу коллекцию…");
    savedModels()
      .then(async (bundles) => {
        for (const b of bundles) {
          if (!alive) return;
          try {
            await v.import(
              { files: b.files, main: b.main },
              { id: b.id, name: b.name, format: b.format },
            );
          } catch {
            if (alive)
              notify(
                `Не удалось восстановить «${b.name}». Загрузите модель ещё раз.`,
                true,
              );
          }
        }
      })
      .catch(() => {
        if (alive)
          notify(
            "Хранилище браузера недоступно. Модели будут открыты до закрытия страницы.",
          );
      })
      .finally(() => {
        working.current = false;
        if (alive) setBusy("");
      });
    return () => {
      alive = false;
      v.dispose();
    };
  }, []);
  async function importFiles(files) {
    if (working.current || !viewer.current) return;
    let entries;
    try {
      entries = validateFiles(files);
    } catch (e) {
      notify(e.message, true);
      return;
    }
    working.current = true;
    setBusy("Подготавливаем модели…");
    setMessage(null);
    let successes = 0,
      unsaved = 0;
    const bundle = files.map((file) => ({
      file,
      path: file.webkitRelativePath || file.name,
    }));
    try {
      for (const file of entries) {
        setBusy(`Открываем ${file.name}…`);
        const id = crypto.randomUUID(),
          name = file.name.replace(/\.[^.]+$/, ""),
          format = extension(file.name).toUpperCase(),
          main = file.webkitRelativePath || file.name;
        await viewer.current.import(
          { files: bundle, main },
          { id, name, format },
        );
        successes++;
        try {
          await saveModel({
            id,
            name,
            format,
            main,
            files: bundle.filter(
              (entry) =>
                entry.path === main ||
                !MODEL_EXTENSIONS.includes(extension(entry.file.name)),
            ),
          });
        } catch {
          unsaved++;
        }
      }
      if (successes)
        notify(
          unsaved
            ? `Открыто моделей: ${successes}. Не сохранено в браузере: ${unsaved}. Эти модели нужно будет загрузить повторно после перезагрузки.`
            : `Открыто моделей: ${successes}. Файлы остаются на этом устройстве.`,
          unsaved > 0,
        );
    } catch (e) {
      notify(`${successes ? `Открыто: ${successes}. ` : ""}${e.message}`, true);
    } finally {
      working.current = false;
      setBusy("");
      setDragging(false);
    }
  }
  async function importURL(value) {
    if (working.current) return;
    let url;
    try {
      url = validateModelURL(value);
    } catch (e) {
      notify(e.message, true);
      return;
    }
    working.current = true;
    setBusy("Загружаем модель по ссылке…");
    try {
      const name = decodeURIComponent(url.pathname.split("/").pop());
      await viewer.current.import(
        { url: url.href },
        {
          id: crypto.randomUUID(),
          name,
          format: extension(name).toUpperCase(),
        },
      );
      setDialog(null);
      notify(
        "Модель открыта по ссылке. После перезагрузки откройте её повторно.",
      );
    } catch (e) {
      notify(
        `Не удалось открыть модель: ${e.message}. Проверьте прямую ссылку и CORS.`,
        true,
      );
    } finally {
      working.current = false;
      setBusy("");
    }
  }
  async function remove(id) {
    viewer.current?.remove(id);
    try {
      await deleteModel(id);
      return true;
    } catch {
      notify("Модель убрана из комнаты, но не из хранилища браузера.", true);
      return false;
    }
  }
  async function enterVR() {
    if (!xr) {
      setDialog("help");
      return;
    }
    try {
      await viewer.current.enterVR();
    } catch (e) {
      notify(`VR не запущен: ${e.message}`, true);
    }
  }
  return (
    <div
      className={`app mobile-${mobilePanel} ${snapshot.immersive ? "is-immersive" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dialog) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        importFiles([...e.dataTransfer.files]);
      }}
    >
      <header className="header">
        <a className="brand" href="./" aria-label="FORMAI — главная">
          <span className="brand-symbol">
            <Box size={33} strokeWidth={1.4} />
          </span>
          <span>
            <strong>FORMAI</strong>
            <small>пространство для идей</small>
          </span>
        </a>
        <span className="studio-title">Студия</span>
        <div className="header-actions">
          <button
            className="help-button"
            aria-label="Помощь"
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={18} />
            <span>Помощь</span>
          </button>
          <button
            className="primary vr-button"
            disabled={!!fatal || !!busy}
            onClick={enterVR}
          >
            <Headset size={20} />
            Войти в VR
          </button>
        </div>
      </header>
      <main className="workspace">
        <Library
          thumbnails={snapshot.thumbnails}
          models={snapshot.models}
          selected={snapshot.selected?.id}
          onSelect={async (id) => {
            if (working.current) return;
            working.current = true;
            setBusy("Открываем модель…");
            try {
              await viewer.current?.ensureDemo(id);
            } catch (e) {
              notify(e.message, true);
            } finally {
              working.current = false;
              setBusy("");
            }
          }}
          onFiles={importFiles}
          onURL={() => setDialog("url")}
          onDelete={remove}
          busy={!!busy}
          onHelp={() => setDialog("help")}
        />
        <section className="viewport" aria-label="Галерея">
          <div className="canvas-host" ref={canvas} />
          <div className="viewport-title">
            Галерея <span>/ 01</span>
          </div>
          <div className="viewport-detail">
            <span className="status-dot" />
            PBR · студийный свет
          </div>
          <div className="mobile-controls">
            <button
              className="icon-button"
              aria-label="Показать коллекцию"
              onClick={() =>
                setMobilePanel((m) => (m === "library" ? "none" : "library"))
              }
            >
              <PanelLeftClose size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Показать свойства"
              onClick={() =>
                setMobilePanel((m) =>
                  m === "inspector" ? "none" : "inspector",
                )
              }
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
          <div className="viewport-toolbar">
            <button
              className="icon-button"
              title="Сфокусировать модель"
              aria-label="Сфокусировать модель"
              onClick={() => viewer.current?.focus()}
            >
              <Focus size={21} />
            </button>
            <button
              className="icon-button"
              title="Отдалить"
              aria-label="Отдалить"
              onClick={() => viewer.current?.zoom(1.2)}
            >
              <ZoomOut size={20} />
            </button>
            <button
              className="icon-button"
              title="Приблизить"
              aria-label="Приблизить"
              onClick={() => viewer.current?.zoom(0.8)}
            >
              <ZoomIn size={20} />
            </button>
            <i />
            <span
              className="orbit-indicator"
              title="Левая кнопка мыши — осмотр"
            >
              <MousePointer2 size={18} />
            </span>
            <button
              className="icon-button"
              title="Полный экран"
              aria-label="Полный экран"
              onClick={() => {
                const p = document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen();
                p?.catch(() =>
                  notify("Полноэкранный режим недоступен в этом браузере."),
                );
              }}
            >
              <Maximize size={20} />
            </button>
          </div>
          <p className="canvas-hint">Вращайте, приближайте, исследуйте</p>
          {busy && (
            <div className="loading-indicator" role="status">
              <LoaderCircle className="spin" size={18} />
              {busy}
            </div>
          )}
          {fatal && (
            <div className="fatal" role="alert">
              <h2>3D-просмотр недоступен</h2>
              <p>{fatal}</p>
              <button className="primary" onClick={() => location.reload()}>
                Попробовать снова
              </button>
            </div>
          )}
        </section>
        <Inspector
          model={snapshot.selected}
          viewer={viewer.current}
          settings={settings}
          setSettings={setSettings}
        />
      </main>
      <footer>
        <span>
          <Info size={15} />
          Все изменения — только на этом устройстве
        </span>
        <span>
          <Headset size={16} />
          {xr ? "Шлем готов · WebXR" : "WebXR · Quest 3"}
        </span>
      </footer>
      {message && (
        <div
          className={`toast ${message.error ? "error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          <span>{message.text}</span>
          <button
            className="icon-button"
            aria-label="Скрыть уведомление"
            onClick={() => setMessage(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {dragging && (
        <div className="drag-overlay">
          <FolderDrop />
          Отпустите файлы, чтобы добавить модели
          <span>Модель, текстуры и файлы .bin — вместе</span>
        </div>
      )}
      {dialog === "help" && <Help onClose={() => setDialog(null)} />}
      {dialog === "url" && (
        <URLDialog
          onClose={() => setDialog(null)}
          onLoad={importURL}
          busy={!!busy}
        />
      )}
    </div>
  );
}
function FolderDrop() {
  return <Box size={44} strokeWidth={1} />;
}
