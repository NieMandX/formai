import * as T from "three";
import { refreshSkinnedBounds } from "./model-bounds.js";

// AR uses the headset's local-floor space. Never move the viewer rig to place content.
// Desktop transforms are kept separately so leaving AR restores the gallery.
export class ARWorkspace {
  constructor(viewer) {
    this.viewer = viewer;
    this.active = false;
    this.ready = false;
    this.drawing = false;
    this.poses = new Map();
  }
  begin() {
    if (this.active) return;
    const { scene, gallery, renderer } = this.viewer;
    this.saved = { background: scene.background, visible: gallery.group.visible,
      color: renderer.getClearColor(new T.Color()), alpha: renderer.getClearAlpha() };
    scene.background = null;
    gallery.group.visible = false;
    renderer.setClearColor(0x000000, 0);
    this.active = true;
  }
  remember(model) {
    if (!this.poses.has(model)) {
      const w = model.wrapper;
      this.poses.set(model, { position: w.position.clone(), quaternion: w.quaternion.clone(), scale: w.scale.clone() });
    }
  }
  position(model, slot = 0) {
    const camera = this.viewer.camera;
    const forward = new T.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new T.Quaternion()));
    forward.y = 0;
    if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
    forward.normalize();
    const right = new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0));
    const column = [0, -1, 1][slot % 3], row = Math.floor(slot / 3);
    model.wrapper.position.copy(camera.getWorldPosition(new T.Vector3()))
      .addScaledVector(forward, 2 + row * 2.2).addScaledVector(right, column * 2.2);
    model.wrapper.position.y = 0;
    model.wrapper.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
    this.floor(model);
  }
  initialize() {
    if (!this.active || this.ready) return;
    this.ready = true;
    for (const model of this.viewer.models.values()) this.add(model);
  }
  add(model) {
    if (!this.active || !this.ready) return;
    this.remember(model);
    this.position(model, model.slot);
  }
  floor(model = this.viewer.selected) {
    if (!model || this.drawing) return;
    model.wrapper.updateMatrixWorld(true);
    if (model.bones) refreshSkinnedBounds(model.wrapper);
    const bounds = new T.Box3().setFromObject(model.wrapper, true);
    if (Number.isFinite(bounds.min.y)) model.wrapper.position.y -= bounds.min.y;
    model.wrapper.updateMatrixWorld(true);
    if (model.bones) refreshSkinnedBounds(model.wrapper);
  }
  placeSelected(reset = false) {
    const model = this.viewer.selected;
    if (!this.active || !model || this.drawing) return;
    this.viewer.xr.cancelGrab();
    if (reset) model.wrapper.scale.setScalar(1);
    this.position(model);
    this.viewer.emit();
  }
  setDrawing(value) {
    if (!this.active || (value && (!this.viewer.models.size || this.viewer.catalogLoad))) return;
    this.viewer.xr.cancelInteractions();
    this.drawing = !!value;
    if (value) this.viewer.xr.menu.close();
    this.viewer.emit();
  }
  forget(model) { this.poses.delete(model); }
  end() {
    if (!this.active) return;
    const { scene, gallery, renderer } = this.viewer;
    for (const [model, pose] of this.poses) {
      const w = model.wrapper;
      w.position.copy(pose.position);
      w.quaternion.copy(pose.quaternion);
      w.scale.copy(pose.scale);
      w.updateMatrixWorld(true);
      if (model.bones) refreshSkinnedBounds(w);
    }
    this.poses.clear();
    scene.background = this.saved.background;
    gallery.group.visible = this.saved.visible;
    renderer.setClearColor(this.saved.color, this.saved.alpha);
    this.active = this.ready = this.drawing = false;
    this.saved = null;
  }
}
