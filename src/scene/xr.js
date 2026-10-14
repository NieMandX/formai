import * as T from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { SpatialMenu } from "./xr-menu.js";
import { applyTwoHandTransform, validTeleport, moveSmooth, buttonEdge } from "./xr-math.js";

export function installXR(viewer) {
  const { renderer, scene, rig } = viewer;
  const raycaster = new T.Raycaster(),
    rotation = new T.Matrix4(),
    controls = [],
    grips = new Set();
  let gesture = null,
    snapReady = true,
    needsPlacement = false,
    session = null,
    disposed = false,
    focused = true;
  let selectionElapsed = 0,
    selectionId = null;
  // The application's camera has the rig transform; the raw XR camera is in reference space before render.
  const head = () => viewer.camera;
  const notify = (text) => menu.toast(text);
  function pulse(control, intensity = 0.3, duration = 25) {
    const actuator = control.input?.gamepad?.hapticActuators?.[0];
    if (actuator?.pulse)
      Promise.resolve(actuator.pulse(intensity, duration)).catch(() => {});
  }
  function cast(control) {
    rotation.extractRotation(control.ray.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(control.ray.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    raycaster.near = 0;
    raycaster.far = 15;
    return raycaster;
  }
  function objectHit(control) {
    const hit = cast(control).intersectObjects(
      [...viewer.models.values()].map((m) => m.wrapper),
      true,
    )[0];
    if (!hit) return null;
    let object = hit.object;
    while (object && !object.userData.modelId) object = object.parent;
    return object ? { ...hit, id: object.userData.modelId } : null;
  }
  function cancelGrab() {
    grips.clear();
    gesture = null;
  }
  function cancelInteractions() {
    cancelGrab();
    for (const c of controls) {
      menu.cancel(c.index);
      c.teleporting = false;
      c.teleportTarget = null;
      c.selectedOnPress = null;
      c.menuPress = false;
      c.dot.visible = false;
      c.beam.visible = false;
    }
    marker.visible = false;
  }
  function teleportTo(point) {
    const p = head().getWorldPosition(new T.Vector3());
    rig.position.x += point.x - p.x;
    rig.position.z += point.z - p.z;
    rig.updateMatrixWorld(true);
  }
  function home() {
    cancelInteractions();
    teleportTo(new T.Vector3(0, 0, 3.6));
    menu.open(head());
  }
  function inspect() {
    if (!viewer.selected) return;
    const box = new T.Box3().setFromObject(viewer.selected.wrapper),
      center = box.getCenter(new T.Vector3()),
      size = box.getSize(new T.Vector3());
    const current = head().getWorldPosition(new T.Vector3()),
      direction = current.clone().sub(center);
    direction.y = 0;
    if (direction.length() < 0.1) direction.set(0, 0, 1);
    direction.normalize();
    const distance = Math.max(1.6, Math.max(size.x, size.y, size.z) * 1.2);
    const point = center.clone().addScaledVector(direction, distance);
    point.x = T.MathUtils.clamp(point.x, -3.7, 3.7);
    point.z = T.MathUtils.clamp(point.z, -3.7, 5.3);
    if (!validTeleport(point, viewer.models.values(), viewer.gallery.plinth)) {
      notify("Недостаточно места рядом. Выберите точку левым стиком.");
      return;
    }
    teleportTo(point);
    menu.close();
  }
  const menu = new SpatialMenu(viewer, {
    recenter: () => {
      cancelGrab();
      menu.open(head());
    },
    home,
    inspect,
    exit: () => {
      const s = renderer.xr.getSession();
      if (s) s.end().catch(() => notify("Не удалось завершить VR-сеанс"));
    },
  });
  const marker = new T.Mesh(
    new T.RingGeometry(0.2, 0.24, 48),
    new T.MeshBasicMaterial({
      color: 0x70ba93,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  const selection = new T.BoxHelper(new T.Object3D(), 0xc88a64);
  selection.visible = false;
  selection.material.transparent = true;
  selection.material.opacity = 0.65;
  scene.add(selection);
  const factory = new XRControllerModelFactory();
  factory.setPath(
    new URL(
      import.meta.env.BASE_URL + "xr-profiles/",
      location.href,
    ).href.replace(/\/$/, ""),
  );
  function capture() {
    const m = viewer.selected,
      hands = [...grips];
    if (!m || !hands.length) {
      gesture = null;
      viewer.emit();
      return;
    }
    m.wrapper.updateMatrixWorld(true);
    if (hands.length === 1)
      gesture = {
        id: m.id,
        relative: new T.Matrix4()
          .copy(hands[0].grip.matrixWorld)
          .invert()
          .multiply(m.wrapper.matrixWorld),
      };
    else {
      const a = hands[0].grip.getWorldPosition(new T.Vector3()),
        b = hands[1].grip.getWorldPosition(new T.Vector3());
      gesture = {
        id: m.id,
        mid: a.clone().add(b).multiplyScalar(0.5),
        vector: b.clone().sub(a),
        position: m.wrapper.position.clone(),
        quaternion: m.wrapper.quaternion.clone(),
        scale: m.wrapper.scale.x,
      };
    }
  }
  function startGrip(c) {
    if (!focused || menu.hit(cast(c))) return;
    const hit = objectHit(c);
    if (!hit) return;
    if (grips.size && hit.id !== viewer.selected?.id) return;
    if (hit.id !== viewer.selected?.id) viewer.select(hit.id);
    grips.add(c);
    capture();
    pulse(c, 0.45, 30);
  }
  function selectStart(c) {
    if (!focused || grips.size || c.teleporting) return;
    const hit = menu.hit(cast(c));
    if (hit) {
      c.menuPress = true;
      menu.begin(c.index, hit);
      pulse(c, 0.28, 20);
      return;
    }
    c.selectedOnPress = objectHit(c)?.id || null;
  }
  function selectEnd(c) {
    if (!focused) return;
    if (c.menuPress) {
      menu.end(c.index, menu.hit(cast(c)));
      c.menuPress = false;
      return;
    }
    const hit = objectHit(c);
    if (c.selectedOnPress && hit?.id === c.selectedOnPress) {
      viewer.select(hit.id);
      pulse(c, 0.3, 25);
      menu.toast("Выбрана: " + viewer.selected.name);
    }
    c.selectedOnPress = null;
  }
  for (let i = 0; i < 2; i++) {
    const ray = renderer.xr.getController(i),
      grip = renderer.xr.getControllerGrip(i);
    rig.add(ray, grip);
    const model = factory.createControllerModel(grip);
    model.setEnvironmentMap(viewer.gallery.environment.texture);
    grip.add(model);
    const beam = new T.Line(
      new T.BufferGeometry().setFromPoints([
        new T.Vector3(),
        new T.Vector3(0, 0, -1),
      ]),
      new T.LineBasicMaterial({
        color: 0xc68a67,
        transparent: true,
        opacity: 0.6,
      }),
    );
    beam.renderOrder = 22;
    ray.add(beam);
    const dot = new T.Mesh(
      new T.SphereGeometry(0.006, 10, 8),
      new T.MeshBasicMaterial({ color: 0xf6e9d9 }),
    );
    dot.renderOrder = 23;
    dot.visible = false;
    scene.add(dot);
    const c = {
      index: i,
      ray,
      grip,
      model,
      beam,
      dot,
      input: null,
      menuButton: false,
      recenterButton: false,
      teleporting: false,
      teleportTarget: null,
    };
    controls.push(c);
    const connected = (e) => {
      c.input = e.data;
      c.menuButton = !!e.data.gamepad?.buttons[4]?.pressed;
      c.recenterButton = !!e.data.gamepad?.buttons[5]?.pressed;
    };
    const disconnected = () => {
      c.input = null;
      grips.delete(c);
      capture();
      menu.cancel(c.index);
      c.menuPress = false;
      c.selectedOnPress = null;
      c.teleporting = false;
      c.teleportTarget = null;
      c.dot.visible = false;
      c.beam.visible = false;
    };
    c.listeners = {
      connected,
      disconnected,
      squeezestart: () => startGrip(c),
      squeezeend: () => {
        grips.delete(c);
        capture();
      },
      selectstart: () => selectStart(c),
      selectend: () => selectEnd(c),
    };
    for (const [event, listener] of Object.entries(c.listeners))
      ray.addEventListener(event, listener);
  }
  function visibilityChanged() {
    focused = session?.visibilityState === "visible";
    if (!focused) cancelInteractions();
  }
  function startSession() {
    viewer.orbit.enabled = false;
    viewer.desktopPose = {
      position: viewer.camera.position.clone(),
      quaternion: viewer.camera.quaternion.clone(),
      fov: viewer.camera.fov,
    };
    renderer.domElement.style.width = "100vw";
    renderer.domElement.style.height = "100dvh";
    renderer.xr.cameraAutoUpdate = false;
    viewer.camera.position.set(0, 0, 0);
    viewer.camera.quaternion.identity();
    rig.position.set(0, 0, 3.6);
    rig.rotation.set(0, 0, 0);
    rig.updateMatrixWorld(true);
    session = renderer.xr.getSession();
    session?.addEventListener("visibilitychange", visibilityChanged);
    focused = true;
    snapReady = true;
    needsPlacement = 2;
    viewer.emit();
  }
  function endSession() {
    session?.removeEventListener("visibilitychange", visibilityChanged);
    session = null;
    cancelInteractions();
    menu.close();
    selection.visible = false;
    needsPlacement = false;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    renderer.xr.cameraAutoUpdate = true;
    if (viewer.desktopPose) {
      viewer.camera.position.copy(viewer.desktopPose.position);
      viewer.camera.quaternion.copy(viewer.desktopPose.quaternion);
      viewer.camera.fov = viewer.desktopPose.fov;
    }
    viewer.orbit.enabled = true;
    viewer.orbit.update();
    viewer.resize();
    viewer.emit();
  }
  renderer.xr.addEventListener("sessionstart", startSession);
  renderer.xr.addEventListener("sessionend", endSession);
  const api = {
    menu,
    controls,
    cancelGrab,
    isManipulating: () => grips.size > 0,
    update(dt) {
      if (disposed || !renderer.xr.isPresenting) return;
      rig.updateMatrixWorld(true);
      renderer.xr.updateCamera(viewer.camera);
      if (needsPlacement && --needsPlacement === 0) menu.open(head());
      if (!focused) return;
      if ([...grips].some((c) => !c.grip.visible)) cancelGrab();
      const selected = viewer.selected;
      if (gesture && viewer.models.has(gesture.id)) {
        const object = viewer.models.get(gesture.id).wrapper,
          hands = [...grips];
        if (hands.length === 1 && gesture.relative)
          new T.Matrix4()
            .multiplyMatrices(hands[0].grip.matrixWorld, gesture.relative)
            .decompose(object.position, object.quaternion, object.scale);
        else if (hands.length === 2 && gesture.vector)
          applyTwoHandTransform(
            object,
            gesture,
            hands[0].grip.getWorldPosition(new T.Vector3()),
            hands[1].grip.getWorldPosition(new T.Vector3()),
          );
        object.position.x = T.MathUtils.clamp(object.position.x, -4, 4);
        object.position.z = T.MathUtils.clamp(object.position.z, -4, 5.5);
        object.position.y = T.MathUtils.clamp(object.position.y, 0, 5);
        object.updateMatrixWorld(true);
      }
      selection.visible = !!selected;
      selectionElapsed += dt;
      if (selected && (selectionElapsed > 0.1 || selected.id !== selectionId)) {
        selection.setFromObject(selected.wrapper);
        selection.material.opacity = grips.size ? 0.85 : 0.4;
        selectionElapsed = 0;
        selectionId = selected.id;
      }
      marker.visible = false;
      let movementAxis = 0, teleported = false;
      for (const c of controls) {
        const input = c.input;
        if (!input || input.hand || !c.ray.visible) {
          c.dot.visible = false;
          c.beam.visible = false;
          continue;
        }
        const buttons = input.gamepad?.buttons || [],
          menuButton = !!buttons[4]?.pressed,
          recenterButton = !!buttons[5]?.pressed;
        if (buttonEdge(c.menuButton, menuButton)) {
          cancelInteractions();
          menu.toggle(head());
          pulse(c);
        }
        if (buttonEdge(c.recenterButton, recenterButton)) {
          cancelInteractions();
          menu.open(head());
          pulse(c);
        }
        c.menuButton = menuButton;
        c.recenterButton = recenterButton;
        const hit = menu.hit(cast(c)),
          object = hit ? null : objectHit(c);
        if (menu.setHover(c.index, hit)) pulse(c, 0.08, 10);
        if (c.menuPress) menu.move(c.index, hit);
        const target = hit || object;
        c.beam.visible = !grips.has(c);
        c.beam.scale.z = target ? target.distance : 3;
        c.beam.material.color.set(
          hit?.control && !hit.control.disabled
            ? 0xe3b08f
            : object
              ? 0xb8d9be
              : 0x96a99a,
        );
        c.dot.visible = !!target && !grips.has(c);
        if (target) {
          c.dot.position.copy(target.point);
          c.dot.scale.setScalar(Math.max(0.7, target.distance * 0.7));
        }
        const axes = input.gamepad?.axes || [],
          x = axes[2] || 0,
          y = axes[3] || 0;
        if (input.handedness === "right") {
          movementAxis = y;
          if (Math.abs(x) < 0.25) snapReady = true;
          if (
            snapReady &&
            Math.abs(x) > 0.7 &&
            !grips.size &&
            !c.menuPress &&
            !hit
          ) {
            const p = head().getWorldPosition(new T.Vector3()),
              yaw = (-Math.sign(x) * Math.PI) / 6;
            rig.position
              .sub(p)
              .applyAxisAngle(new T.Vector3(0, 1, 0), yaw)
              .add(p);
            rig.rotation.y += yaw;
            rig.updateMatrixWorld(true);
            renderer.xr.updateCamera(viewer.camera);
            snapReady = false;
            menu.close();
            pulse(c, 0.2, 20);
          }
        }
        if (input.handedness === "left") {
          const aiming = y < -0.65 && !grips.size && !c.menuPress && !hit;
          if (aiming) {
            c.teleporting = true;
            const floor = cast(c).intersectObject(viewer.gallery.floor)[0];
            c.teleportTarget =
              floor &&
              validTeleport(
                floor.point,
                viewer.models.values(),
                viewer.gallery.plinth,
              )
                ? floor.point.clone()
                : null;
            if (floor) {
              marker.visible = true;
              marker.position.copy(floor.point);
              marker.position.y = 0.015;
              marker.material.color.set(c.teleportTarget ? 0x70ba93 : 0xd66b5f);
              c.beam.scale.z = floor.distance;
            }
          } else if (c.teleporting) {
            if (Math.abs(y) < 0.3 && c.teleportTarget && !grips.size && !hit) {
              teleportTo(c.teleportTarget);
              teleported = true;
              menu.close();
              pulse(c, 0.4, 35);
            }
            c.teleporting = false;
            c.teleportTarget = null;
          }
        }
      }
      if (!grips.size && !teleported && !controls.some((c) => c.menuPress || c.teleporting)) {
        moveSmooth(rig, head(), movementAxis, dt, viewer.models.values(), viewer.gallery.plinth);
        rig.updateMatrixWorld(true);
      }
      menu.update(dt);
      renderer.xr.updateCamera(viewer.camera);
    },
    dispose() {
      disposed = true;
      session?.removeEventListener("visibilitychange", visibilityChanged);
      renderer.xr.removeEventListener("sessionstart", startSession);
      renderer.xr.removeEventListener("sessionend", endSession);
      for (const c of controls)
        for (const [event, listener] of Object.entries(c.listeners))
          c.ray.removeEventListener(event, listener);
      menu.dispose();
    },
  };
  return api;
}
