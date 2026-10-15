import * as T from "three";
import {
  MENU,
  buildMenuLayout,
  hitControl,
  sliderValue,
  clamp,
} from "./xr-menu-model.js";
import { buildMaterialMenuLayout } from "./xr-material-menu.js";
import { catalogView } from "../library-catalog.js";
import { materialControlState } from "./material-controls.js";

const C = {
  paper: "#f5f4ef",
  ink: "#252e2b",
  muted: "#6f7973",
  line: "#d9dfd8",
  accent: "#a96b4f",
  active: "#e8d7cc",
  hover: "#e5e9e2",
  side: "#202c28",
  sideText: "#f6f7ef",
  sideMuted: "#9faea6",
  danger: "#9b4541",
};
export class SpatialMenu {
  constructor(viewer, actions) {
    this.viewer = viewer;
    this.actions = actions;
    this.tab = "collection";
    this.mode = "main";
    this.materialTarget = "all";
    this.materialPage = 0;
    this.materialModelId = null;
    this.page = 0;
    this.collectionPath = "";
    this.clipPage = 0;
    this.confirm = null;
    this.busy = false;
    this.notice = "";
    this.noticeUntil = 0;
    this.hover = new Map();
    this.pressed = new Map();
    this.dirty = true;
    this.elapsed = 0;
    this.lastSync = 0;
    this.lastSignature = "";
    this.canvas = document.createElement("canvas");
    this.canvas.width = MENU.width;
    this.canvas.height = MENU.height;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = Math.min(
      4,
      viewer.renderer.capabilities.getMaxAnisotropy(),
    );
    this.texture.generateMipmaps = false;
    this.texture.minFilter = T.LinearFilter;
    this.group = new T.Group();
    this.group.visible = false;
    this.group.name = "FORMAI spatial menu";
    this.surface = new T.Mesh(
      new T.PlaneGeometry(
        MENU.worldWidth,
        (MENU.worldWidth * MENU.height) / MENU.width,
      ),
      new T.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        alphaTest: 0.05,
        toneMapped: false,
        depthTest: false,
        depthWrite: true,
      }),
    );
    this.surface.renderOrder = 20;
    this.group.add(this.surface);
    viewer.scene.add(this.group);
    this.thumbs = {};
    for (const [key, url] of Object.entries(viewer.thumbnails || {})) {
      const img = new Image();
      img.onload = () => {
        this.thumbs[key] = img;
        this.dirty = true;
      };
      img.src = url;
    }
    this.sync();
  }
  get visible() {
    return this.group.visible;
  }
  modelState() {
    const m = this.viewer.selected;
    if (!m) return null;
    return {
      id: m.id,
      name: m.name,
      format: m.format,
      scale: m.wrapper.scale.x,
      position: m.wrapper.position.toArray(),
      rotation: T.MathUtils.radToDeg(m.wrapper.rotation.y),
      clips: m.clips.map(({ name, duration }) => ({ name, duration })),
      bones: m.bones,
      triangles: m.triangles,
      clip: m.clip,
      speed: m.speed,
      playing: m.playing,
      time:
        this.tab === "animation"
          ? Math.round((m.action?.time || 0) * 10) / 10
          : 0,
    };
  }
  state() {
    if (this.materialModelId !== (this.viewer.selected?.id || null)) {
      this.materialModelId = this.viewer.selected?.id || null;
      this.materialTarget = "all";
      this.materialPage = 0;
      this.pressed.clear();
      this.hover.clear();
    }
    return {
      mode: this.mode,
      tab: this.tab,
      page: this.page,
      collectionPath: this.collectionPath,
      clipPage: this.clipPage,
      confirm: this.confirm,
      busy: this.busy || !!this.viewer.catalogLoad,
      notice: this.viewer.catalogLoad?.text || this.notice,
      settings: this.viewer.settings,
      model: this.modelState(),
      ...(this.mode === "materials" ? {
        materialTarget: this.materialTarget, materialPage: this.materialPage,
        ...materialControlState(this.viewer.selected?.materialControls, this.materialTarget),
      } : {}),
      models: [...this.viewer.models.values()].map((m) => ({
        id: m.id,
        name: m.name,
        format: m.format,
        animations: m.clips.length,
      })),
    };
  }
  sync() {
    const state = this.state(),
      signature = JSON.stringify(state);
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.layout = this.mode === "materials" ? buildMaterialMenuLayout(state) : buildMenuLayout(state);
      this.dirty = true;
    }
    if (this.dirty) this.draw();
  }
  place(camera) {
    const head = camera.getWorldPosition(new T.Vector3());
    const forward = new T.Vector3(0, 0, -1).applyQuaternion(
      camera.getWorldQuaternion(new T.Quaternion()),
    );
    forward.y = 0;
    if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
    forward.normalize();
    this.group.position.copy(head).addScaledVector(forward, MENU.distance);
    // Leave the model visible beside its smaller material panel.
    if (this.mode === "materials")
      this.group.position.addScaledVector(new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0)), 0.62);
    this.group.position.y = Math.max(0.8, head.y - 0.13);
    this.group.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
    this.group.updateMatrixWorld(true);
  }
  open(camera, mode = this.mode) {
    this.mode = mode;
    this.surface.scale.setScalar(mode === "materials" ? 0.78 : 1);
    this.hover.clear();
    this.pressed.clear();
    this.confirm = null;
    this.group.visible = true;
    this.place(camera);
    this.sync();
  }
  close() {
    this.group.visible = false;
    this.confirm = null;
    this.hover.clear();
    this.pressed.clear();
    this.dirty = true;
  }
  toggle(camera, mode = this.mode) {
    if (this.visible && this.mode === mode) this.close();
    else this.open(camera, mode);
  }
  hit(ray) {
    if (!this.visible) return null;
    const intersection = ray.intersectObject(this.surface)[0];
    if (!intersection) return null;
    const x = intersection.uv.x * MENU.width,
      y = (1 - intersection.uv.y) * MENU.height;
    return {
      ...intersection,
      x,
      y,
      control: hitControl(this.layout.controls, x, y),
    };
  }
  pointFor(id) {
    const c = this.layout.controls.find((c) => c.id === id);
    if (!c) return null;
    return this.surface.localToWorld(
      new T.Vector3(
        ((c.x + c.w / 2) / MENU.width - 0.5) * MENU.worldWidth,
        ((0.5 - (c.y + c.h / 2) / MENU.height) *
          MENU.worldWidth *
          MENU.height) /
          MENU.width,
        0.005,
      ),
    );
  }
  setHover(pointer, hit) {
    const id = hit?.control?.id || null;
    if (this.hover.get(pointer) !== id) {
      this.hover.set(pointer, id);
      this.dirty = true;
      return !!id && !hit.control.disabled;
    }
    return false;
  }
  begin(pointer, hit) {
    if (!hit?.control || hit.control.disabled) return false;
    this.pressed.set(pointer, hit.control);
    this.dirty = true;
    if (hit.control.type === "slider") this.adjust(hit.control, hit.x);
    return true;
  }
  move(pointer, hit) {
    const c = this.pressed.get(pointer);
    if (c?.type === "slider" && hit) this.adjust(c, hit.x);
  }
  end(pointer, hit) {
    const c = this.pressed.get(pointer);
    this.pressed.delete(pointer);
    this.dirty = true;
    if (
      c &&
      c.type !== "slider" &&
      hit?.control?.id === c.id &&
      !hit.control.disabled
    )
      this.activate(c.id, c.modelId);
  }
  cancel(pointer) {
    this.pressed.delete(pointer);
    this.hover.delete(pointer);
    this.dirty = true;
  }
  adjust(c, x) {
    const value = sliderValue(c, x),
      v = this.viewer;
    if (c.id === "scale") v.setScale(Math.exp(value));
    if (c.id === "rotation") v.setRotation(value);
    if (c.id === "speed") v.setSpeed(value);
    if (c.id === "time") v.seek(value);
    if (c.id === "exposure") v.setSceneSetting("exposure", value);
    if (c.id.startsWith("map:")) v.setMapGain(c.target, c.id.slice(4), value, c.modelId);
    this.sync();
  }
  toast(text) {
    this.notice = text;
    this.noticeUntil = this.elapsed + 5;
    this.sync();
  }
  async activate(id, modelId) {
    const v = this.viewer;
    if (id === "unload") {
      if (this.busy || v.catalogLoad || !v.selected ||
          (modelId && modelId !== v.selected.id)) return;
      // Room-only action: keep imported files in IndexedDB and catalogue entries.
      v.remove(v.selected.id);
      this.close();
    } else if (id === "material:prev" || id === "material:next") {
      if (v.catalogLoad) return;
      const entries = ["all", ...(v.selected?.materialControls || []).map(m => m.id)];
      const index = Math.max(0, entries.indexOf(this.materialTarget));
      this.materialTarget = entries[clamp(index + (id.endsWith("next") ? 1 : -1), 0, entries.length - 1)];
      this.materialPage = 0;
      this.pressed.clear();
    } else if (id === "maps:prev" || id === "maps:next") {
      const control = this.layout.controls.find(c => c.id === id);
      if (control && !control.disabled) { this.materialPage = control.targetPage; this.pressed.clear(); }
    } else if (id === "maps:reset") v.resetMapGains(this.materialTarget);
    else if (id.startsWith("tab:")) {
      this.tab = id.slice(4);
      this.confirm = null;
      this.clipPage = 0;
    } else if (id === "close") this.close();
    else if (id === "recenter") this.actions.recenter();
    else if (id === "exit") this.confirm = { type: "exit" };
    else if (id === "cancel") this.confirm = null;
    else if (id === "confirm") {
      const request = this.confirm;
      this.confirm = null;
      if (request?.type === "exit") this.actions.exit();
      else if (request?.type === "delete") {
        try {
          const saved = await v.onDeleteRequest?.(request.id);
          this.toast(
            saved === false
              ? "Убрана из комнаты. Сохранённую копию удалить не удалось."
              : "Модель убрана из комнаты",
          );
          this.tab = "collection";
        } catch {
          this.toast("Не удалось удалить сохранённую копию");
        }
      }
    } else if (id.startsWith("folder:")) {
      this.collectionPath = catalogView(id.slice(7)).path;
      this.page = 0;
      this.pressed.clear();
      this.hover.clear();
    } else if (id.startsWith("model:")) {
      if (this.busy || v.catalogLoad) return;
      const modelId = id.slice(6);
      this.busy = true;
      this.toast("Открываем модель…");
      try {
        await v.ensureModel(modelId);
        if (v.selected) this.toast("Выбрана: " + v.selected.name);
        this.clipPage = 0;
      } catch (e) {
        this.toast(e.message);
      } finally {
        this.busy = false;
      }
    } else if (id === "page:prev" || id === "page:next") {
      const control = this.layout.controls.find((c) => c.id === id);
      if (control && !control.disabled) this.page = control.targetPage;
    }
    else if (id === "clips:prev")
      this.clipPage = Math.max(0, this.clipPage - 1);
    else if (id === "clips:next") this.clipPage++;
    else if (id.startsWith("clip:")) v.setClip(+id.slice(5));
    else if (id === "playing") v.setPlaying(!v.selected?.playing);
    else if (id.startsWith("position:")) {
      const [, axis, sign] = id.split(":");
      if (v.selected)
        v.setPosition(
          axis,
          v.selected.wrapper.position[axis] + Number(sign) * 0.1,
        );
    } else if (id === "reset") {
      v.resetSelected();
      this.toast("Модель установлена на пьедестал");
    } else if (id === "inspect") {
      this.actions.inspect();
    } else if (id === "delete" && v.selected)
      this.confirm = {
        type: "delete",
        id: v.selected.id,
        name: v.selected.name,
        reference: !!v.selected.reference,
      };
    else if (id.startsWith("lighting:"))
      v.setSceneSetting("lighting", id.slice(9));
    else if (id === "grid" || id === "autoRotate")
      v.setSceneSetting(id, !v.settings[id]);
    else if (id === "home") this.actions.home();
    this.sync();
  }
  update(dt) {
    this.elapsed += dt;
    if (this.notice && this.elapsed > this.noticeUntil) {
      this.notice = "";
      this.dirty = true;
    }
    if (this.visible && (this.dirty || this.elapsed - this.lastSync > 0.1)) {
      this.lastSync = this.elapsed;
      this.sync();
    }
  }
  rect(x, y, w, h, r, fill, stroke) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  text(
    text,
    x,
    y,
    size = 28,
    { weight = 500, color = C.ink, align = "left", maxWidth } = {},
  ) {
    const ctx = this.ctx;
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    let value = String(text);
    if (maxWidth && ctx.measureText(value).width > maxWidth) {
      while (value.length && ctx.measureText(value + "…").width > maxWidth)
        value = value.slice(0, -1);
      value += "…";
    }
    ctx.fillText(value, x, y);
  }
  icon(name, x, y, size, color) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.scale(size / 24, size / 24);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    const line = (a, b, d, e) => {
      c.moveTo(a, b);
      c.lineTo(d, e);
    };
    if (name === "folder") {
      c.moveTo(3, 5); c.lineTo(9, 5); c.lineTo(12, 8);
      c.lineTo(21, 8); c.lineTo(21, 20); c.lineTo(3, 20); c.closePath();
      line(3, 10, 21, 10);
    }
    if (name === "box") {
      c.moveTo(12, 2);
      c.lineTo(22, 7);
      c.lineTo(22, 17);
      c.lineTo(12, 22);
      c.lineTo(2, 17);
      c.lineTo(2, 7);
      c.closePath();
      line(2, 7, 12, 12);
      line(22, 7, 12, 12);
      line(12, 12, 12, 22);
    }
    if (name === "sliders") {
      [5, 12, 19].forEach((a, i) => {
        line(a, 3, a, 21);
        const cy = [8, 16, 10][i];
        line(a - 3, cy, a + 3, cy);
      });
    }
    if (name === "sun") {
      c.arc(12, 12, 4, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          12 + Math.cos(a) * 8,
          12 + Math.sin(a) * 8,
          12 + Math.cos(a) * 10,
          12 + Math.sin(a) * 10,
        );
      }
    }
    if (name === "play") {
      c.moveTo(7, 3);
      c.lineTo(21, 12);
      c.lineTo(7, 21);
      c.closePath();
    }
    if (name === "pause") {
      line(8, 4, 8, 20);
      line(16, 4, 16, 20);
    }
    if (name === "close") {
      line(5, 5, 19, 19);
      line(19, 5, 5, 19);
    }
    if (name === "plus" || name === "minus") {
      line(4, 12, 20, 12);
      if (name === "plus") line(12, 4, 12, 20);
    }
    if (name === "left" || name === "right") {
      const d = name === "left" ? -1 : 1;
      line(12 - d * 4, 4, 12 + d * 4, 12);
      line(12 + d * 4, 12, 12 - d * 4, 20);
    }
    if (name === "focus") {
      for (const [a, b, d, e] of [
        [3, 8, 3, 3],
        [3, 3, 8, 3],
        [16, 3, 21, 3],
        [21, 3, 21, 8],
        [21, 16, 21, 21],
        [21, 21, 16, 21],
        [8, 21, 3, 21],
        [3, 21, 3, 16],
      ])
        line(a, b, d, e);
      c.moveTo(15, 12);
      c.arc(12, 12, 3, 0, Math.PI * 2);
    }
    if (name === "reset") {
      c.arc(12, 12, 8, -Math.PI * 0.7, Math.PI * 0.8);
      line(3, 3, 3, 9);
      line(3, 9, 9, 9);
    }
    if (name === "trash") {
      line(3, 6, 21, 6);
      line(9, 3, 15, 3);
      c.moveTo(6, 6);
      c.lineTo(7, 21);
      c.lineTo(17, 21);
      c.lineTo(18, 6);
      line(10, 10, 10, 17);
      line(14, 10, 14, 17);
    }
    if (name === "exit") {
      c.moveTo(9, 3);
      c.lineTo(3, 3);
      c.lineTo(3, 21);
      c.lineTo(9, 21);
      line(9, 12, 22, 12);
      line(17, 7, 22, 12);
      line(22, 12, 17, 17);
    }
    if (name === "help") {
      c.arc(12, 12, 10, 0, Math.PI * 2);
      c.moveTo(9, 9);
      c.bezierCurveTo(9, 3, 19, 7, 12, 13);
      line(12, 13, 12, 14);
      line(12, 18, 12, 18.2);
    }
    c.stroke();
    c.restore();
  }
  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, MENU.width, MENU.height);
    this.rect(0, 0, MENU.width, MENU.height, 38, C.paper);
    c.save();
    c.beginPath();
    c.roundRect(0, 0, MENU.width, MENU.height, 38);
    c.clip();
    c.fillStyle = C.side;
    if (this.mode === "main") c.fillRect(0, 0, 284, MENU.height);
    c.restore();
    c.strokeStyle = C.line;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(this.mode === "main" ? 316 : 48, 162);
    c.lineTo(1374, 162);
    c.stroke();
    const hovered = new Set(this.hover.values()),
      pressed = new Set([...this.pressed.values()].map((p) => p.id));
    for (const b of this.layout.controls) {
      const hover = hovered.has(b.id) && !b.disabled,
        down = pressed.has(b.id) && !b.disabled;
      let bg = b.sidebar ? C.side : b.active ? C.active : "#fff",
        fg = b.sidebar ? C.sideText : b.danger ? C.danger : C.ink;
      if (b.sidebar && b.active) bg = "#3c4b43";
      if (b.primary) {
        bg = C.side;
        fg = "#fff";
      }
      if (hover) bg = b.sidebar || b.primary ? "#4d6255" : C.hover;
      if (down) bg = b.sidebar || b.primary ? C.accent : "#d8bba8";
      c.globalAlpha = b.disabled ? 0.38 : 1;
      if (b.type === "slider") {
        this.text(b.text, b.x, b.y + 28, 29, { weight: 550 });
        this.text(b.format, b.x + b.w, b.y + 28, 30, {
          align: "right",
          weight: 650,
          color: C.accent,
        });
        const trackX = b.x + 28,
          trackW = b.w - 56,
          trackY = b.y + 69,
          t = clamp((b.value - b.min) / (b.max - b.min), 0, 1);
        this.rect(trackX, trackY, trackW, 10, 5, C.line);
        if (t > 0)
          this.rect(trackX, trackY, Math.max(10, trackW * t), 10, 5, C.accent);
        if (b.reference !== undefined) {
          const referenceX = trackX + trackW * (b.reference - b.min) / (b.max - b.min);
          c.strokeStyle = C.muted;
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(referenceX, trackY - 9); c.lineTo(referenceX, trackY + 19); c.stroke();
        }
        c.beginPath();
        c.arc(
          trackX + t * trackW,
          trackY + 5,
          hover || down ? 22 : 18,
          0,
          Math.PI * 2,
        );
        c.fillStyle = down ? C.accent : "#fff";
        c.fill();
        c.strokeStyle = C.accent;
        c.lineWidth = 3;
        c.stroke();
      } else {
        this.rect(
          b.x,
          b.y,
          b.w,
          b.h,
          20,
          bg,
          b.sidebar
            ? undefined
            : down
              ? C.accent
              : b.active
                ? "#be8a6c"
                : C.line,
        );
        if (hover && !b.sidebar) {
          c.strokeStyle = C.accent;
          c.lineWidth = 3;
          c.stroke();
        }
        let tx = b.x + 30;
        if (b.iconOnly)
          this.icon(b.icon, b.x + (b.w - 36) / 2, b.y + (b.h - 36) / 2, 36, fg);
        else {
          if (b.thumb && this.thumbs[b.thumb]) {
            const size = Math.min(88, b.h - 24);
            c.drawImage(this.thumbs[b.thumb], b.x + 16, b.y + (b.h - size) / 2, size, size);
            tx = b.x + 128;
          } else if (b.icon) {
            const size = b.sidebar ? 26 : 32;
            this.icon(
              b.icon,
              b.x + (b.sidebar ? 16 : 24),
              b.y + (b.h - size) / 2,
              size,
              fg,
            );
            tx = b.x + (b.sidebar ? 56 : 76);
          }
          const font = b.sidebar ? 26 : 30;
          this.text(b.text, tx, b.y + b.h / 2 + (b.subtitle ? -6 : 10), font, {
            weight: b.active || b.primary ? 650 : 550,
            color: fg,
            maxWidth:
              b.w - (tx - b.x) - (b.sidebar ? 12 : 30) - (b.toggle ? 110 : 0),
          });
          if (b.subtitle)
            this.text(b.subtitle, tx, b.y + b.h / 2 + 30, 23, {
              color: C.muted,
              maxWidth: b.w - (tx - b.x) - 28,
            });
          if (b.toggle) {
            this.rect(
              b.x + b.w - 116,
              b.y + (b.h - 44) / 2,
              84,
              44,
              22,
              b.value ? C.accent : C.line,
            );
            c.beginPath();
            c.arc(
              b.x + b.w - (b.value ? 54 : 94),
              b.y + b.h / 2,
              16,
              0,
              Math.PI * 2,
            );
            c.fillStyle = "#fff";
            c.fill();
          }
        }
      }
      c.globalAlpha = 1;
    }
    for (const l of this.layout.labels)
      this.text(l.text, l.x, l.y, l.size, {
        ...l,
        color: l.sidebar
          ? l.muted
            ? C.sideMuted
            : C.sideText
          : l.muted
            ? C.muted
            : C.ink,
      });
    this.texture.needsUpdate = true;
    this.dirty = false;
  }
  dispose() {
    this.group.removeFromParent();
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    this.texture.dispose();
  }
}
