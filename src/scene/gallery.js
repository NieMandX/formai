import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
export function textPlane(
  text,
  width,
  height,
  { size = 70, color = "#726d62", background, subtext } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round((1024 * height) / width);
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${size}px Arial`;
  ctx.fillText(text, 512, canvas.height * (subtext ? 0.4 : 0.5));
  if (subtext) {
    ctx.font = "24px Arial";
    ctx.fillText(subtext, 512, canvas.height * 0.8);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return new T.Mesh(
    new T.PlaneGeometry(width, height),
    new T.MeshBasicMaterial({
      map: texture,
      transparent: !background,
      side: T.DoubleSide,
    }),
  );
}
export function createGallery(scene, renderer) {
  scene.background = new T.Color(0xe7e3da);
  const pmrem = new T.PMREMGenerator(renderer),
    studio = new RoomEnvironment();
  const environment = pmrem.fromScene(studio, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  studio.dispose();
  pmrem.dispose();
  const group = new T.Group();
  scene.add(group);
  const stone = new T.MeshStandardMaterial({
      color: 0xd9d4c8,
      roughness: 0.65,
    }),
    wall = new T.MeshStandardMaterial({ color: 0xe1ddd3, roughness: 0.9 }),
    white = new T.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.5 });
  const box = (w, h, d, x, y, z, mat = wall) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const floor = box(12, 0.12, 14, 0, -0.07, 0, stone);
  floor.name = "floor";
  box(9, 3.8, 0.15, 0, 1.9, -4.5);
  box(0.15, 3.8, 14, -4.5, 1.9, 0);
  box(0.15, 3.8, 14, 4.5, 1.9, 0);
  box(9, 0.12, 14, 0, 3.8, 0);
  for (const x of [-2.8, 0, 2.8]) {
    box(2.4, 0.08, 3.2, x, 3.69, -1, white);
    box(
      2.2,
      0.025,
      3,
      x,
      3.635,
      -1,
      new T.MeshBasicMaterial({ color: 0xfffbeb }),
    );
  }
  const grid = new T.GridHelper(14, 14, 0xbbb5a9, 0xc9c2b6);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  group.add(grid);
  for (const z of [-3, 0, 3]) {
    box(0.16, 3.6, 0.18, -4.1, 1.8, z, white);
    box(
      0.13,
      3.1,
      2.4,
      -4.38,
      1.9,
      z,
      new T.MeshBasicMaterial({ color: 0xfff7df }),
    );
  }
  box(1.8, 0.45, 0.65, -3.8, 0.225, -2.5, white);
  const plinth = new T.Mesh(
    new T.CylinderGeometry(1.35, 1.37, 0.28, 80),
    white,
  );
  plinth.position.y = 0.14;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);
  const ring = new T.Mesh(new T.CylinderGeometry(1.25, 1.25, 0.05, 80), stone);
  ring.position.y = 0.025;
  group.add(ring);
  const title = textPlane("F O R M A I", 3.4, 0.65, {
    size: 112,
    subtext: "п р о с т р а н с т в о   д л я   и д е й",
  });
  title.position.set(0, 2.8, -4.4);
  group.add(title);
  const lamp = new T.DirectionalLight(0xfff0da, 3.1);
  lamp.position.set(-3.5, 3.45, 3);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  Object.assign(lamp.shadow.camera, {
    left: -7,
    right: 7,
    top: 7,
    bottom: -7,
    near: 0.1,
    far: 20,
  });
  lamp.shadow.normalBias = 0.025;
  lamp.shadow.bias = -0.00008;
  lamp.shadow.radius = 3;
  scene.add(lamp);
  const fill = new T.HemisphereLight(0xe7efff, 0xb3a891, 0.65);
  scene.add(fill);
  const pot = new T.Mesh(new T.CylinderGeometry(0.25, 0.2, 0.55, 24), stone);
  pot.position.set(-3.1, 0.275, -3.4);
  group.add(pot);
  const trunk = new T.Mesh(
    new T.CylinderGeometry(0.025, 0.055, 1.65, 8),
    new T.MeshStandardMaterial({ color: 0x79705a }),
  );
  trunk.position.set(-3.1, 1.25, -3.4);
  group.add(trunk);
  const leaves = new T.InstancedMesh(
    new T.SphereGeometry(1, 8, 6),
    new T.MeshStandardMaterial({ color: 0x6e7756, roughness: 0.85 }),
    60,
  );
  const dummy = new T.Object3D();
  for (let i = 0; i < 60; i++) {
    const a = i * 2.399,
      r = 0.18 + ((i * 17) % 29) / 60;
    dummy.position.set(
      -3.1 + Math.cos(a) * r,
      1.3 + (i % 13) / 11,
      -3.4 + Math.sin(a) * r,
    );
    dummy.scale.set(0.08, 0.2, 0.035);
    dummy.rotation.set(i, 0.3 * i, i * 0.4);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  group.add(leaves);
  return {
    floor,
    grid,
    plinth,
    environment,
    group,
    setLighting(mode) {
      lamp.color.set(mode === "neutral" ? 0xf4f7ff : 0xffe8cc);
      fill.intensity = mode === "neutral" ? 0.9 : 0.65;
      scene.environmentIntensity = mode === "neutral" ? 0.9 : 0.65;
    },
  };
}
