import * as THREE from "three";
import { extension, normalizedPath, validateModelURL } from "../model-utils.js";
import { downloadModel } from "./download.js";
import { hydrateSourceMaterials } from "./source-materials.js";

export function disposeObject(root) {
  const textures = new Set(),
    materials = new Set(),
    geometries = new Set(),
    skeletons = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      materials.add(m);
      for (const value of Object.values(m))
        if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach((t) => {
    t.source?.data?.close?.();
    t.dispose();
  });
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
  skeletons.forEach((s) => s.dispose());
}

async function parser(ext, data, path, manager, renderer, cleanups) {
  if (ext === "glb" || ext === "gltf") {
    const [
      { GLTFLoader },
      { DRACOLoader },
      { KTX2Loader },
      { MeshoptDecoder },
    ] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/DRACOLoader.js"),
      import("three/addons/loaders/KTX2Loader.js"),
      import("three/addons/libs/meshopt_decoder.module.js"),
    ]);
    const draco = new DRACOLoader()
      .setDecoderPath(`${import.meta.env.BASE_URL}decoders/draco/`)
      .setWorkerLimit(2);
    const ktx = new KTX2Loader()
      .setTranscoderPath(`${import.meta.env.BASE_URL}decoders/basis/`)
      .setWorkerLimit(2)
      .detectSupport(renderer);
    cleanups.push(
      () => draco.dispose(),
      () => ktx.dispose(),
    );
    const result = await new GLTFLoader(manager)
      .setDRACOLoader(draco)
      .setKTX2Loader(ktx)
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(data, path);
    try {
      await hydrateSourceMaterials(result, renderer);
    } catch (error) {
      disposeObject(result.scene);
      throw error;
    }
    return { root: result.scene, clips: result.animations };
  }
  if (ext === "fbx") {
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    const root = new FBXLoader(manager).parse(data, path);
    return { root, clips: root.animations || [] };
  }
  const text = () => new TextDecoder().decode(data);
  if (ext === "obj") {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    const loader = new OBJLoader(manager),
      source = text();
    const libraries = [...source.matchAll(/^mtllib\s+(.+)$/gm)].map((m) =>
      m[1].trim(),
    );
    if (libraries.length) {
      const { MTLLoader } = await import("three/addons/loaders/MTLLoader.js");
      // OBJ may reference multiple material libraries. Merge the resulting materials.
      let materials;
      for (const lib of libraries) {
        const current = await new MTLLoader(manager)
          .setResourcePath(path)
          .loadAsync(path + lib);
        current.preload();
        if (!materials) materials = current;
        else {
          Object.assign(materials.materialsInfo, current.materialsInfo);
          Object.assign(materials.materials, current.materials);
        }
      }
      loader.setMaterials(materials);
    }
    return { root: loader.parse(source), clips: [] };
  }
  if (ext === "dae") {
    const { ColladaLoader } = await import(
      "three/addons/loaders/ColladaLoader.js"
    );
    const result = new ColladaLoader(manager).parse(text(), path);
    return {
      root: result.scene,
      clips: result.scene.animations || result.animations || [],
    };
  }
  const geometry =
    ext === "stl"
      ? new (
          await import("three/addons/loaders/STLLoader.js")
        ).STLLoader().parse(data)
      : new (
          await import("three/addons/loaders/PLYLoader.js")
        ).PLYLoader().parse(data);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: geometry.hasAttribute("color") ? 0xffffff : 0xb7795d,
    roughness: 0.55,
    metalness: 0.05,
    vertexColors: geometry.hasAttribute("color"),
  });
  return { root: new THREE.Mesh(geometry, material), clips: [] };
}

export async function loadModel({ files, main, url, signal, onProgress, expectedBytes, maxBytes }, renderer) {
  const manager = new THREE.LoadingManager();
  const urls = [],
    cleanups = [],
    failed = [];
  let loading = false,
    finish;
  const settled = new Promise((resolve) => {
    finish = resolve;
  });
  manager.onStart = () => {
    loading = true;
  };
  manager.onLoad = () => {
    loading = false;
    finish();
  };
  manager.onError = (address) => {
    failed.push(address);
  };
  let result;
  try {
    let data, ext, path;
    if (files) {
      const map = new Map(),
        basenames = new Map();
      for (const entry of files) {
        const file = entry.file || entry,
          name = normalizedPath(
            entry.path || file.webkitRelativePath || file.name,
          );
        const objectURL = URL.createObjectURL(file);
        urls.push(objectURL);
        map.set(name, objectURL);
        const base = name.split("/").pop();
        basenames.set(base, basenames.has(base) ? null : objectURL);
      }
      const entry = files.find(
        (f) => (f.path || f.webkitRelativePath || f.name) === main,
      );
      if (!entry) throw new Error("Основной файл модели не найден.");
      const file = entry.file || entry;
      const name = normalizedPath(main);
      path =
        "https://forma.local/" +
        (name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "");
      manager.setURLModifier((address) => {
        if (/^(data:|blob:)/.test(address)) return address;
        const candidate = normalizedPath(
          address.replace(/^https:\/\/forma\.local\//, ""),
        );
        const resolved =
          map.get(candidate) || basenames.get(candidate.split("/").pop());
        if (!resolved)
          throw new Error(
            `Не найден файл: ${candidate.split("/").pop()}. Выберите модель и все текстуры вместе или загрузите папку.`,
          );
        return resolved;
      });
      data = await file.arrayBuffer();
      ext = extension(file.name);
    } else {
      const parsed = validateModelURL(url);
      data = await downloadModel(parsed.href, { signal, onProgress, expectedBytes, maxBytes });
      ext = extension(parsed.pathname);
      path = new URL(".", parsed).href;
    }
    result = await parser(ext, data, path, manager, renderer, cleanups);
    if (loading) await settled;
    if (failed.length)
      throw new Error(
        "Часть текстур или файлов модели недоступна. Проверьте комплект файлов и разрешение CORS сервера.",
      );
    return result;
  } catch (error) {
    if (result) disposeObject(result.root);
    throw error;
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
    cleanups.forEach((fn) => fn());
  }
}
