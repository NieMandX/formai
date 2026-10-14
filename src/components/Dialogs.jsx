import { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowUpRight,
  Headset,
  MousePointer2,
  FolderOpen,
} from "lucide-react";
export function Modal({ title, onClose, children }) {
  const dialog = useRef();
  useEffect(() => {
    const d = dialog.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Help({ onClose }) {
  return (
    <Modal title="Ваше пространство в VR" onClose={onClose}>
      <p className="modal-intro">
        Откройте адрес этой страницы в Meta Quest Browser на Quest 3. Загрузите
        модели и нажмите «Войти в VR».
      </p>
      <div className="help-block">
        <Headset size={22} />
        <div>
          <h3>В шлеме</h3>
          <p>
            Курок — выбрать модель или кнопку. Боковая кнопка — захват.
            Захватите модель двумя контроллерами и разведите руки для
            увеличения. Левый стик вперёд — выбрать место на полу, отпустить —
            переместиться. Правый стик — поворот на 30°.
          </p>
          <p>
            X или A открывает меню; Y или B возвращает его перед вами. В меню
            доступны коллекция, трансформации, анимации, освещение и настройки
            сцены. Загрузка файлов остаётся в веб-версии до входа в VR.
          </p>
        </div>
      </div>
      <div className="help-block">
        <MousePointer2 size={22} />
        <div>
          <h3>На компьютере</h3>
          <p>
            Левая кнопка мыши — осмотр. Колесо — приближение. Правая кнопка —
            сдвиг камеры. Нажмите на объект для выбора; положение, масштаб и
            анимация меняются справа.
          </p>
        </div>
      </div>
      <div className="help-block">
        <FolderOpen size={22} />
        <div>
          <h3>Модели и материалы</h3>
          <p>
            GLB/glTF — рекомендуемый формат для PBR и скелетной анимации.
            Поддерживаются Draco, Meshopt и KTX2. FBX и DAE поддерживают
            встроенную анимацию; материалы могут отличаться от исходного
            редактора. OBJ + MTL, STL и PLY подходят для геометрии.
          </p>
          <p>
            Для glTF, OBJ, FBX и DAE выбирайте модель вместе с текстурами и .bin
            либо всю папку. STL/PLY не содержат PBR-материалы. BLEND, MAX, C4D,
            STEP и USDZ нужно экспортировать в GLB. Анимации должны быть
            запечены: физика, скрипты и процедурные шейдеры не переносятся.
          </p>
          <p>
            Файлы остаются в этом браузере. Чтобы открыть ту же модель на шлеме,
            скопируйте файл на Quest или используйте прямую HTTPS-ссылку с
            разрешённым CORS. До 100 МБ на файл и 12 моделей в комнате. 100% —
            размер, вписанный в 1,8 м.
          </p>
        </div>
      </div>
      <a
        className="docs-link"
        href="https://developers.meta.com/vr/documentation/web/webxr-overview/"
        target="_blank"
        rel="noreferrer"
      >
        О WebXR в Meta Quest Browser <ArrowUpRight size={14} />
      </a>
    </Modal>
  );
}
export function URLDialog({ onClose, onLoad, busy }) {
  const [url, setURL] = useState("");
  return (
    <Modal title="Модель по ссылке" onClose={onClose}>
      <p className="modal-intro">
        Прямая HTTPS-ссылка на файл. Для моделей с текстурами удобнее
        использовать один GLB. Сервер должен разрешать CORS.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onLoad(url);
        }}
      >
        <label className="field-label" htmlFor="model-url">
          Адрес модели
        </label>
        <input
          id="model-url"
          type="url"
          autoFocus
          required
          placeholder="https://example.com/character.glb"
          value={url}
          onChange={(e) => setURL(e.target.value)}
        />
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Загрузка…" : "Открыть модель"}
        </button>
      </form>
    </Modal>
  );
}
