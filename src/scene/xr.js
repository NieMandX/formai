import * as T from "three";
import { textPlane } from "./gallery";
import { clampScale } from "../model-utils";

export function installXR(viewer) {
  const { renderer, scene, rig } = viewer;
  const raycaster = new T.Raycaster(),
    rotation = new T.Matrix4();
  const controls = [],
    grips = new Set();
  let gesture = null,
    snapReady = true;
  const panel = new T.Group();
  panel.visible = false;
  scene.add(panel);
  panel.position.set(1.6, 1.35, 1.0);
  panel.rotation.y = -0.48;
  const back = new T.Mesh(
    new T.BoxGeometry(1.48, 1.06, 0.04),
    new T.MeshBasicMaterial({ color: 0xf4f2ed }),
  );
  panel.add(back);
  const header = textPlane("FORMAI · управление", 1.35, 0.16, {
    size: 54,
    color: "#292c28",
  });
  header.position.set(0, 0.4, 0.025);
  panel.add(header);
  const buttons = [];
  function button(label, x, y, action) {
    const p = textPlane(label, 0.64, 0.17, {
      size: 63,
      color: "#faf8f3",
      background: "#333b35",
    });
    p.position.set(x, y, 0.03);
    p.userData.action = action;
    panel.add(p);
    buttons.push(p);
    return p;
  }
  button("← модель", -0.35, 0.17, () => viewer.cycle(-1));
  button("модель →", 0.35, 0.17, () => viewer.cycle(1));
  button("▶ / II", -0.35, -0.04, () =>
    viewer.setPlaying(!viewer.selected?.playing),
  );
  button("Анимация →", 0.35, -0.04, () => viewer.nextClip());
  button("Меньше −", -0.35, -0.25, () =>
    viewer.setScale((viewer.selected?.wrapper.scale.x || 1) / 1.2),
  );
  button("Больше +", 0.35, -0.25, () =>
    viewer.setScale((viewer.selected?.wrapper.scale.x || 1) * 1.2),
  );
  button("На пьедестал", -0.35, -0.46, () => viewer.resetSelected());
  button("Выйти из VR", 0.35, -0.46, () => renderer.xr.getSession()?.end());
  const status = textPlane("Выберите модель лучом", 1.4, 0.14, {
    size: 48,
    color: "#44483f",
  });
  status.position.set(0, 0.64, 0);
  panel.add(status);
  const hint = textPlane(
    "Боковая кнопка — захват · Две руки — масштаб",
    2.6,
    0.18,
    { size: 42, color: "#555b4e", background: "#f2eee5" },
  );
  hint.position.set(0, 0.65, 1.3);
  scene.add(hint);
  hint.visible = false;
  const marker = new T.Mesh(
    new T.RingGeometry(0.19, 0.24, 40),
    new T.MeshBasicMaterial({ color: 0xb57552, side: T.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  function cast(controller) {
    rotation.extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    return raycaster;
  }
  function objectHit(controller) {
    const hits = cast(controller).intersectObjects(
      [...viewer.models.values()].map((m) => m.wrapper),
      true,
    );
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.modelId) obj = obj.parent;
    return obj?.userData.modelId;
  }
  function startGrip(controller) {
    const id = objectHit(controller);
    // A second hand grabbing the same model must preserve the first grip.
    if (id && id !== viewer.selected?.id) viewer.select(id);
    if (!viewer.selected) return;
    grips.add(controller);
    capture();
  }
  function capture() {
    const selected = viewer.selected;
    if (!selected) return;
    const hands = [...grips];
    if (!hands.length) {
      gesture = null;
      viewer.emit();
      return;
    }
    selected.wrapper.updateMatrixWorld(true);
    if (hands.length === 1) {
      gesture = {
        id: selected.id,
        relative: new T.Matrix4()
          .copy(hands[0].matrixWorld)
          .invert()
          .multiply(selected.wrapper.matrixWorld),
      };
    } else {
      const a = hands[0].getWorldPosition(new T.Vector3()),
        b = hands[1].getWorldPosition(new T.Vector3());
      gesture = {
        id: selected.id,
        mid: a.clone().add(b).multiplyScalar(0.5),
        vector: b.clone().sub(a),
        position: selected.wrapper.position.clone(),
        quaternion: selected.wrapper.quaternion.clone(),
        scale: selected.wrapper.scale.x,
      };
    }
  }
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    rig.add(controller);
    controls.push(controller);
    const line = new T.Line(
      new T.BufferGeometry().setFromPoints([
        new T.Vector3(),
        new T.Vector3(0, 0, -1),
      ]),
      new T.LineBasicMaterial({
        color: 0xa56b4f,
        transparent: true,
        opacity: 0.7,
      }),
    );
    line.scale.z = 5;
    controller.add(line);
    const grip = renderer.xr.getControllerGrip(i);
    rig.add(grip);
    const body = new T.Mesh(
      new T.CapsuleGeometry(0.022, 0.07, 4, 10),
      new T.MeshStandardMaterial({ color: 0xd4d5cf, roughness: 0.4 }),
    );
    body.rotation.x = Math.PI / 2;
    grip.add(body);
    controller.addEventListener("connected", (e) => {
      controller.userData.input = e.data;
    });
    controller.addEventListener("disconnected", () => {
      delete controller.userData.input;
      grips.delete(controller);
      capture();
    });
    controller.addEventListener("squeezestart", () => startGrip(controller));
    controller.addEventListener("squeezeend", () => {
      grips.delete(controller);
      capture();
    });
    controller.addEventListener("selectstart", () => {
      if (grips.size) return;
      const action = cast(controller).intersectObjects(buttons)[0];
      if (action) {
        action.object.userData.action();
        return;
      }
      const id = objectHit(controller);
      if (id) {
        viewer.select(id);
        return;
      }
      const floor = cast(controller).intersectObject(viewer.gallery.floor)[0];
      if (
        floor &&
        Math.abs(floor.point.x) < 3.9 &&
        floor.point.z > -3.8 &&
        floor.point.z < 5.5
      ) {
        const camera = renderer.xr
          .getCamera()
          .getWorldPosition(new T.Vector3());
        rig.position.x += floor.point.x - camera.x;
        rig.position.z += floor.point.z - camera.z;
      }
    });
  }
  renderer.xr.addEventListener("sessionstart", () => {
    viewer.orbit.enabled = false;
    viewer.desktopPose = {
      position: viewer.camera.position.clone(),
      quaternion: viewer.camera.quaternion.clone(),
    };
    viewer.camera.position.set(0, 0, 0);
    viewer.camera.quaternion.identity();
    rig.position.set(0, 0, 3.6);
    rig.rotation.set(0, 0, 0);
    panel.visible = true;
    hint.visible = true;
    viewer.emit();
  });
  renderer.xr.addEventListener("sessionend", () => {
    grips.clear();
    gesture = null;
    panel.visible = false;
    hint.visible = false;
    marker.visible = false;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    if (viewer.desktopPose) {
      viewer.camera.position.copy(viewer.desktopPose.position);
      viewer.camera.quaternion.copy(viewer.desktopPose.quaternion);
    }
    viewer.orbit.enabled = true;
    viewer.orbit.update();
    viewer.emit();
  });
  return {
    cancelGrab() {
      grips.clear();
      gesture = null;
    },
    update(dt) {
      if (!renderer.xr.isPresenting) return;
      if (gesture && viewer.models.has(gesture.id)) {
        const object = viewer.models.get(gesture.id).wrapper,
          hands = [...grips];
        if (hands.length === 1 && gesture.relative) {
          new T.Matrix4()
            .multiplyMatrices(hands[0].matrixWorld, gesture.relative)
            .decompose(object.position, object.quaternion, object.scale);
        } else if (hands.length === 2 && gesture.vector) {
          const a = hands[0].getWorldPosition(new T.Vector3()),
            b = hands[1].getWorldPosition(new T.Vector3()),
            vector = b.clone().sub(a),
            mid = a.clone().add(b).multiplyScalar(0.5);
          const ratio =
            vector.length() / Math.max(0.05, gesture.vector.length());
          const q = new T.Quaternion().setFromUnitVectors(
            gesture.vector.clone().normalize(),
            vector.normalize(),
          );
          object.position
            .copy(gesture.position)
            .sub(gesture.mid)
            .multiplyScalar(ratio)
            .applyQuaternion(q)
            .add(mid);
          object.quaternion.copy(q).multiply(gesture.quaternion);
          object.scale.setScalar(clampScale(gesture.scale * ratio));
        }
        object.position.y = Math.max(-1, Math.min(6, object.position.y));
      }
      marker.visible = false;
      for (const controller of controls) {
        const input = controller.userData.input;
        if (!input) continue;
        if (!grips.size) {
          const floor = cast(controller).intersectObject(
            viewer.gallery.floor,
          )[0];
          if (
            floor &&
            Math.abs(floor.point.x) < 3.9 &&
            floor.point.z > -3.8 &&
            floor.point.z < 5.5
          ) {
            marker.position.copy(floor.point);
            marker.position.y = 0.01;
            marker.visible = true;
          }
        }
        const axis = input.gamepad?.axes;
        if (input.handedness === "right" && axis) {
          const x = axis[2] ?? axis[0] ?? 0;
          if (Math.abs(x) < 0.25) snapReady = true;
          if (snapReady && Math.abs(x) > 0.7 && !grips.size) {
            const head = renderer.xr
                .getCamera()
                .getWorldPosition(new T.Vector3()),
              yaw = (-Math.sign(x) * Math.PI) / 6;
            rig.position
              .sub(head)
              .applyAxisAngle(new T.Vector3(0, 1, 0), yaw)
              .add(head);
            rig.rotation.y += yaw;
            snapReady = false;
          }
        }
        if (input.handedness === "left" && axis && !grips.size) {
          const y = axis[3] ?? axis[1] ?? 0;
          if (Math.abs(y) > 0.3 && viewer.selected)
            viewer.setScale(
              viewer.selected.wrapper.scale.x * Math.exp(-y * dt),
              false,
            );
        }
      }
    },
  };
}
