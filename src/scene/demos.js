import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export { DEMO_MODELS as DEMOS } from "../library-catalog.js";
export function makeDemo(id) {
  if (id === "robot") return makeRobot();
  const root = new T.Group();
  if (id === "knot") {
    const knot = new T.Mesh(
      new T.TorusKnotGeometry(0.62, 0.235, 160, 24),
      new T.MeshPhysicalMaterial({
        color: 0xb66f4e,
        roughness: 0.38,
        metalness: 0.07,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
      }),
    );
    knot.rotation.set(0.25, 0.2, -0.35);
    root.add(knot);
  } else {
    const chalk = new T.MeshStandardMaterial({
      color: 0xe2ddd0,
      roughness: 0.72,
    });
    const brass = new T.MeshPhysicalMaterial({
      color: 0xb99b64,
      metalness: 0.9,
      roughness: 0.22,
    });
    const piece = (w, h, d, x, y, z, material = chalk) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), material);
      m.position.set(x, y, z);
      root.add(m);
    };
    piece(1.8, 0.12, 1.5, 0, 0, 0);
    piece(0.32, 1.8, 0.65, -0.55, 0.9, 0);
    piece(0.32, 1.8, 0.65, 0.55, 0.9, 0);
    piece(1.42, 0.32, 0.65, 0, 1.65, 0);
    piece(0.5, 0.65, 0.5, -0.55, 0.4, 0.65);
    piece(0.55, 0.05, 0.55, -0.55, 0.75, 0.65, brass);
    const ball = new T.Mesh(new T.SphereGeometry(0.26, 32, 24), brass);
    ball.position.set(0.1, 0.32, 0.5);
    root.add(ball);
  }
  return { root, clips: [] };
}
export function makeRobot() {
  const bones = [],
    geo = [];
  const bone = (name, parent, pos) => {
    const b = new T.Bone();
    b.name = name;
    b.position.set(...pos);
    if (parent) parent.add(b);
    bones.push(b);
    return b;
  };
  const hip = bone("Hips", null, [0, 0.97, 0]);
  const chest = bone("Chest", hip, [0, 0.33, 0]),
    head = bone("Head", chest, [0, 0.42, 0]);
  const leftArm = bone("LeftArm", chest, [-0.34, 0.18, 0]),
    leftForearm = bone("LeftForearm", leftArm, [0, -0.34, 0]);
  const rightArm = bone("RightArm", chest, [0.34, 0.18, 0]),
    rightForearm = bone("RightForearm", rightArm, [0, -0.34, 0]);
  const leftLeg = bone("LeftLeg", hip, [-0.16, -0.1, 0]),
    leftShin = bone("LeftShin", leftLeg, [0, -0.38, 0]);
  const rightLeg = bone("RightLeg", hip, [0.16, -0.1, 0]),
    rightShin = bone("RightShin", rightLeg, [0, -0.38, 0]);
  const root = new T.Group();
  root.add(hip);
  root.updateMatrixWorld(true);
  const part = (b, shape, offset, color) => {
    shape.translate(...offset);
    shape.applyMatrix4(b.matrixWorld);
    const count = shape.attributes.position.count,
      indices = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4),
      colors = new Float32Array(count * 3),
      c = new T.Color(color);
    for (let i = 0; i < count; i++) {
      indices[i * 4] = bones.indexOf(b);
      weights[i * 4] = 1;
      c.toArray(colors, i * 3);
    }
    shape.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
    shape.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
    shape.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geo.push(shape.toNonIndexed());
    shape.dispose();
  };
  const dark = 0x3b4341,
    light = 0xc6c8bd,
    accent = 0xc47b53;
  part(hip, new T.BoxGeometry(0.38, 0.22, 0.26), [0, 0, 0], dark);
  part(chest, new T.BoxGeometry(0.48, 0.48, 0.3), [0, 0.05, 0], light);
  part(chest, new T.BoxGeometry(0.3, 0.13, 0.025), [0, 0.13, 0.165], accent);
  part(head, new T.SphereGeometry(0.21, 24, 16), [0, 0.1, 0], light);
  part(head, new T.BoxGeometry(0.29, 0.08, 0.08), [0, 0.12, 0.17], dark);
  for (const x of [-0.07, 0.07])
    part(head, new T.SphereGeometry(0.025, 12, 8), [x, 0.12, 0.22], 0xffc085);
  for (const b of [leftArm, rightArm]) {
    part(b, new T.SphereGeometry(0.12, 16, 12), [0, 0, 0], accent);
    part(
      b,
      new T.CylinderGeometry(0.085, 0.075, 0.3, 12),
      [0, -0.17, 0],
      light,
    );
  }
  for (const b of [leftForearm, rightForearm]) {
    part(b, new T.SphereGeometry(0.085, 16, 12), [0, 0, 0], dark);
    part(b, new T.CylinderGeometry(0.08, 0.09, 0.27, 12), [0, -0.16, 0], light);
    part(b, new T.SphereGeometry(0.1, 16, 12), [0, -0.34, 0], dark);
  }
  for (const b of [leftLeg, rightLeg])
    part(b, new T.CylinderGeometry(0.11, 0.09, 0.35, 12), [0, -0.2, 0], light);
  for (const b of [leftShin, rightShin]) {
    part(b, new T.SphereGeometry(0.1, 16, 12), [0, 0, 0], accent);
    part(b, new T.CylinderGeometry(0.08, 0.075, 0.33, 12), [0, -0.2, 0], light);
    part(b, new T.BoxGeometry(0.19, 0.12, 0.3), [0, -0.39, 0.05], dark);
  }
  const geometry = mergeGeometries(geo);
  geo.forEach((g) => g.dispose());
  const mesh = new T.SkinnedMesh(
    geometry,
    new T.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.45,
      roughness: 0.36,
    }),
  );
  mesh.name = "FormaRobot";
  root.add(mesh);
  mesh.bind(new T.Skeleton(bones));
  const rotation = (b, axis, angles, times) => {
    const values = [];
    angles.forEach((a) =>
      new T.Quaternion()
        .setFromAxisAngle(new T.Vector3(...axis), a)
        .toArray(values, values.length),
    );
    return new T.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values);
  };
  const idle = new T.AnimationClip("Ожидание", 3, [
    rotation(
      chest,
      [0, 0, 1],
      [0, 0.025, 0, -0.025, 0],
      [0, 0.75, 1.5, 2.25, 3],
    ),
    rotation(head, [0, 1, 0], [-0.15, 0.15, -0.15], [0, 1.5, 3]),
  ]);
  const times = [0, 0.3, 0.6, 0.9, 1.2];
  const walk = new T.AnimationClip("Шаг на месте", 1.2, [
    rotation(leftLeg, [1, 0, 0], [-0.5, 0, 0.5, 0, -0.5], times),
    rotation(rightLeg, [1, 0, 0], [0.5, 0, -0.5, 0, 0.5], times),
    rotation(leftArm, [1, 0, 0], [0.4, 0, -0.4, 0, 0.4], times),
    rotation(rightArm, [1, 0, 0], [-0.4, 0, 0.4, 0, -0.4], times),
    rotation(leftShin, [1, 0, 0], [0, 0.55, 0, 0, 0], times),
    rotation(rightShin, [1, 0, 0], [0, 0, 0, 0.55, 0], times),
  ]);
  const wave = new T.AnimationClip("Приветствие", 2, [
    rotation(rightArm, [0, 0, 1], [0, 2.3, 2.3, 2.3, 0], [0, 0.4, 1, 1.6, 2]),
    rotation(
      rightForearm,
      [0, 0, 1],
      [0, 0.4, -0.5, 0.4, -0.5, 0],
      [0, 0.4, 0.8, 1.2, 1.6, 2],
    ),
    rotation(head, [0, 0, 1], [0, -0.15, 0], [0, 1, 2]),
  ]);
  return { root, clips: [idle, walk, wave] };
}
