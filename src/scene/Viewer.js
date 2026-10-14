import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createGallery } from "./gallery";
import { makeDemo } from "./demos";
import { disposeObject, loadModel } from "./loaders";
import { installXR } from "./xr";
import { clampScale } from "../model-utils";

export class Viewer {
  constructor(element, onChange) {
    this.element = element;
    this.onChange = onChange;
    this.models = new Map();
    this.selected = null;
    this.disposed = false;
    this.autoRotate = false;
    this.settings = {
      grid: true,
      autoRotate: false,
      lighting: "gallery",
      exposure: 1,
    };
    this.nextSlot = 0;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(45, 1, 0.05, 100);
    this.camera.position.set(0.8, 2.15, 5.7);
    this.rig = new T.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
    this.renderer.xr.setFramebufferScaleFactor(1);
    element.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Интерактивная 3D-галерея",
    );
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 1.15, 0);
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 0.4;
    this.orbit.maxDistance = 12;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.orbit.update();
    this.gallery = createGallery(this.scene, this.renderer);
    this.thumbnails = this.makeThumbnails();
    this.xr = installXR(this);
    this.resize = () => {
      if (this.renderer.xr.isPresenting) return;
      const { width, height } = element.getBoundingClientRect();
      this.camera.aspect = width / Math.max(height, 1);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(element);
    this.resize();
    this.pointerStart = null;
    this.pointerDown = (e) => {
      this.pointerStart = [e.clientX, e.clientY];
    };
    this.pointerUp = (e) => {
      if (
        !this.pointerStart ||
        Math.hypot(
          e.clientX - this.pointerStart[0],
          e.clientY - this.pointerStart[1],
        ) > 5
      )
        return;
      const r = element.getBoundingClientRect(),
        ray = new T.Raycaster();
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = ray.intersectObjects(
        [...this.models.values()].map((m) => m.wrapper),
        true,
      )[0];
      if (hit) {
        let o = hit.object;
        while (o && !o.userData.modelId) o = o.parent;
        if (o) this.select(o.userData.modelId);
      }
    };
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    let last = 0;
    this.renderer.setAnimationLoop((time) => {
      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;
      for (const m of this.models.values()) {
        if (m.playing) m.mixer?.update(dt * m.speed);
      }
      if (this.autoRotate && this.selected && !this.xr.isManipulating())
        this.selected.wrapper.rotation.y += dt * 0.25;
      this.xr.update(dt);
      if (!this.renderer.xr.isPresenting) this.orbit.update();
      this.renderer.render(this.scene, this.camera);
    });
    this.add(makeDemo("knot"), { id: "knot", name: "Узел", format: "DEMO" });
  }
  makeThumbnails() {
    const results = {},
      originalRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(144, 144, false);
    for (const id of ["knot", "architecture", "robot"]) {
      const { root } = makeDemo(id),
        s = new T.Scene();
      s.background = new T.Color(0xe9e6df);
      s.environment = this.gallery.environment.texture;
      root.updateMatrixWorld(true);
      const b = new T.Box3().setFromObject(root, true),
        center = b.getCenter(new T.Vector3()),
        size = b.getSize(new T.Vector3());
      const group = new T.Group();
      group.add(root);
      const scale = 1.7 / Math.max(size.x, size.y, size.z);
      group.scale.setScalar(scale);
      group.position.copy(center).multiplyScalar(-scale);
      s.add(group);
      s.add(new T.HemisphereLight(0xffffff, 0x8b806a, 1));
      const light = new T.DirectionalLight(0xfff4e3, 3);
      light.position.set(-2, 3, 4);
      s.add(light);
      const camera = new T.PerspectiveCamera(36, 1, 0.1, 20);
      camera.position.set(2, 1, 3.5);
      camera.lookAt(0, 0, 0);
      this.renderer.render(s, camera);
      results[id] = this.renderer.domElement.toDataURL("image/webp");
      disposeObject(root);
    }
    this.renderer.setPixelRatio(originalRatio);
    return results;
  }
  async import(source, meta) {
    const result = await loadModel(source, this.renderer);
    if (this.disposed) {
      disposeObject(result.root);
      return;
    }
    return this.add(result, meta);
  }
  add({ root, clips }, meta) {
    if (this.models.size >= 12) {
      disposeObject(root);
      throw new Error(
        "В прототипе можно разместить до 12 моделей. Удалите одну из коллекции.",
      );
    }
    root.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(root, true),
      size = bounds.getSize(new T.Vector3()),
      center = bounds.getCenter(new T.Vector3()),
      max = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(max) || max < 0.000001) {
      disposeObject(root);
      throw new Error("В файле не найдено видимой геометрии.");
    }
    const normalizer = new T.Group(),
      wrapper = new T.Group();
    wrapper.userData.modelId = meta.id;
    normalizer.add(root);
    wrapper.add(normalizer);
    normalizer.scale.setScalar(1.8 / max);
    normalizer.position
      .set(-center.x, -bounds.min.y, -center.z)
      .multiplyScalar(1.8 / max);
    const slots = [
      [0, 0.28, 0],
      [-2, 0.02, 0],
      [2, 0.02, 0],
      [-2, 0.02, -2.4],
      [0, 0.02, -2.4],
      [2, 0.02, -2.4],
      [-2, 0.02, 2.3],
      [0, 0.02, 2.3],
      [2, 0.02, 2.3],
      [-3.5, 0.02, -1.2],
      [3.5, 0.02, -1.2],
      [0, 0.02, 4.3],
    ];
    let slot = 0;
    while ([...this.models.values()].some((m) => m.slot === slot)) slot++;
    wrapper.position.set(...slots[slot]);
    this.scene.add(wrapper);
    let triangles = 0,
      bones = 0;
    root.traverse((o) => {
      if (o.isLight || o.isCamera) o.visible = false;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        triangles +=
          (o.geometry.index?.count ||
            o.geometry.attributes.position?.count ||
            0) / 3;
        if (o.isSkinnedMesh) {
          bones += o.skeleton.bones.length;
          o.frustumCulled = false;
        }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const converted = mats.map((m) => {
          if (!m || m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)
            return m;
          if (m.isMeshPhongMaterial || m.isMeshLambertMaterial) {
            const p = new T.MeshStandardMaterial({
              color: m.color,
              map: m.map,
              normalMap: m.normalMap,
              aoMap: m.aoMap,
              emissiveMap: m.emissiveMap,
              emissive: m.emissive,
              alphaMap: m.alphaMap,
              opacity: m.opacity,
              transparent: m.transparent,
              side: m.side,
              roughness: 0.55,
              metalness: 0,
              vertexColors: m.vertexColors,
            });
            m.dispose();
            return p;
          }
          return m;
        });
        o.material = Array.isArray(o.material) ? converted : converted[0];
      }
    });
    const model = {
      ...meta,
      slot,
      wrapper,
      root,
      clips,
      mixer: clips.length ? new T.AnimationMixer(root) : null,
      clip: 0,
      playing: clips.length > 0,
      speed: 1,
      triangles: Math.round(triangles),
      bones,
      originalSize: size.toArray(),
      fit: 1.8 / max,
    };
    this.models.set(meta.id, model);
    if (clips.length) model.action = model.mixer.clipAction(clips[0]).play();
    this.select(meta.id);
    return model;
  }
  async ensureDemo(id) {
    if (this.models.has(id)) {
      this.select(id);
      return;
    }
    if (id === "robot") {
      return this.import(
        {
          url: new URL(
            import.meta.env.BASE_URL + "models/forma-robot.glb",
            location.href,
          ).href,
        },
        { id: "robot", name: "Робот", format: "GLB" },
      );
    }
    const names = { knot: "Узел", architecture: "Архитектура", robot: "Робот" };
    this.add(makeDemo(id), { id, name: names[id], format: "DEMO" });
  }
  select(id) {
    this.xr?.cancelGrab();
    this.selected = this.models.get(id) || null;
    this.emit();
  }
  cycle(direction) {
    const ids = [...this.models.keys()];
    if (ids.length)
      this.select(
        ids[
          (ids.indexOf(this.selected?.id) + direction + ids.length) % ids.length
        ],
      );
  }
  setScale(value, emit = true) {
    if (!this.selected) return;
    this.selected.wrapper.scale.setScalar(clampScale(value));
    if (emit) this.emit();
  }
  setPosition(axis, value) {
    if (!this.selected || !Number.isFinite(value)) return;
    this.selected.wrapper.position[axis] = Math.max(-8, Math.min(8, value));
    this.emit();
  }
  setRotation(degrees) {
    if (!this.selected) return;
    this.selected.wrapper.rotation.y = (degrees * Math.PI) / 180;
    this.emit();
  }
  resetSelected() {
    if (!this.selected) return;
    this.xr.cancelGrab();
    const w = this.selected.wrapper;
    w.position.set(0, 0.28, 0);
    w.rotation.set(0, 0, 0);
    w.scale.setScalar(1);
    this.emit();
  }
  actualScale() {
    if (this.selected) this.setScale(1 / this.selected.fit);
  }
  setPlaying(value) {
    if (this.selected?.mixer) {
      this.selected.playing = value;
      this.emit();
    }
  }
  setSpeed(value) {
    if (this.selected) {
      this.selected.speed = value;
      this.emit();
    }
  }
  seek(seconds) {
    const m = this.selected;
    if (!m?.action) return;
    m.action.time = T.MathUtils.clamp(seconds, 0, m.clips[m.clip].duration);
    m.mixer.update(0);
    this.emit();
  }
  setSceneSetting(key, value) {
    if (!(key in this.settings)) return;
    this.settings = { ...this.settings, [key]: value };
    if (key === "grid") this.gallery.grid.visible = value;
    if (key === "autoRotate") this.autoRotate = value;
    if (key === "exposure") this.renderer.toneMappingExposure = value;
    if (key === "lighting") this.gallery.setLighting(value);
    this.emit();
  }
  setClip(index) {
    const m = this.selected;
    if (!m?.clips[index]) return;
    m.action?.fadeOut(0.2);
    m.action = m.mixer.clipAction(m.clips[index]);
    m.action.reset().fadeIn(0.2).play();
    m.clip = index;
    m.playing = true;
    this.emit();
  }
  nextClip() {
    const m = this.selected;
    if (m?.clips.length) this.setClip((m.clip + 1) % m.clips.length);
  }
  remove(id) {
    const m = this.models.get(id);
    if (!m) return;
    this.xr.cancelGrab();
    m.mixer?.stopAllAction();
    m.mixer?.uncacheRoot(m.root);
    this.scene.remove(m.wrapper);
    disposeObject(m.wrapper);
    this.models.delete(id);
    if (this.selected === m)
      this.selected = [...this.models.values()][0] || null;
    this.emit();
  }
  focus() {
    if (!this.selected || this.renderer.xr.isPresenting) return;
    const bounds = new T.Box3().setFromObject(this.selected.wrapper),
      center = bounds.getCenter(new T.Vector3()),
      size = bounds.getSize(new T.Vector3());
    this.orbit.target.copy(center);
    this.camera.position
      .copy(center)
      .add(
        new T.Vector3(2, 1.1, 4)
          .normalize()
          .multiplyScalar(Math.max(size.x, size.y, size.z) * 2.3),
      );
    this.orbit.update();
  }
  zoom(factor) {
    this.camera.position
      .sub(this.orbit.target)
      .multiplyScalar(factor)
      .add(this.orbit.target);
    this.orbit.update();
  }
  async enterVR() {
    if (!navigator.xr)
      throw new Error(
        "Откройте эту страницу в Meta Quest Browser на шлеме Quest 3. На компьютере доступен обычный 3D-просмотр.",
      );
    let session;
    try {
      session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["bounded-floor"],
      });
      await this.renderer.xr.setSession(session);
      if (session.supportedFrameRates?.includes(72))
        await session.updateTargetFrameRate(72).catch(() => {});
    } catch (e) {
      await session?.end().catch(() => {});
      throw e;
    }
  }
  emit() {
    const m = this.selected;
    this.onChange({
      settings: this.settings,
      thumbnails: this.thumbnails,
      models: [...this.models.values()].map(
        ({ id, name, format, clips, triangles, bones }) => ({
          id,
          name,
          format,
          animations: clips.length,
          triangles,
          bones,
        }),
      ),
      selected: m
        ? {
            id: m.id,
            name: m.name,
            format: m.format,
            scale: m.wrapper.scale.x,
            position: m.wrapper.position.toArray(),
            rotation: (m.wrapper.rotation.y * 180) / Math.PI,
            clips: m.clips.map((c) => ({
              name: c.name || "Без имени",
              duration: c.duration,
            })),
            clip: m.clip,
            playing: m.playing,
            speed: m.speed,
            triangles: m.triangles,
            bones: m.bones,
            originalSize: m.originalSize,
          }
        : null,
      immersive: this.renderer.xr.isPresenting,
    });
  }
  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.orbit.dispose();
    this.xr.dispose();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.pointerDown,
    );
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    for (const id of [...this.models.keys()]) this.remove(id);
    disposeObject(this.scene);
    this.gallery.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
