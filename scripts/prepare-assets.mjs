import { mkdir, copyFile, writeFile, readFile, cp } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { makeRobot } from "../src/scene/demos.js";
import { prepareSpatial } from "./prepare-spatial.mjs";
import { prepareReferences } from "./prepare-references.mjs";
const require = createRequire(import.meta.url),
  threeRoot = path.resolve(path.dirname(require.resolve("three")), "..");
for (const [folder, files] of Object.entries({
  draco: ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"],
  basis: ["basis_transcoder.js", "basis_transcoder.wasm"],
})) {
  await mkdir(`public/decoders/${folder}`, { recursive: true });
  for (const file of files)
    await copyFile(
      path.join(
        threeRoot,
        `examples/jsm/libs/${folder === "draco" ? "draco/gltf" : "basis"}/${file}`,
      ),
      `public/decoders/${folder}/${file}`,
    );
}
// The exporter uses FileReader in browsers. This minimal Node adapter contains no DOM shims.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
const { root, clips } = makeRobot();
root.updateMatrixWorld(true);
const glb = await new GLTFExporter().parseAsync(root, {
  binary: true,
  animations: clips,
});
await mkdir("public/models", { recursive: true });
await writeFile("public/models/forma-robot.glb", Buffer.from(glb));
console.log("Prepared local Draco/KTX2 decoders and skeletal GLB demo.");

// Ship the official Quest profiles with the app; no third-party CDN at runtime.
const assetsRoot = path.dirname(
  require.resolve("@webxr-input-profiles/assets/package.json"),
);
const profilesRoot = path.join(assetsRoot, "dist/profiles");
const profiles = JSON.parse(
  await readFile(path.join(profilesRoot, "profilesList.json"), "utf8"),
);
const included = {};
await mkdir("public/xr-profiles", { recursive: true });
for (const id of [
  "meta-quest-touch-plus",
  "meta-quest-touch-plus-v2",
  "oculus-touch-v3",
  "generic-trigger",
]) {
  included[id] = profiles[id];
  await cp(path.join(profilesRoot, id), path.join("public/xr-profiles", id), {
    recursive: true,
  });
  const profile = JSON.parse(
    await readFile(path.join(profilesRoot, id, "profile.json"), "utf8"),
  );
  // Some upstream profiles describe a system-menu animation absent from their GLB.
  // Keep the input mapping, but skip visual responses without corresponding nodes.
  for (const layout of Object.values(profile.layouts)) {
    const buffer = await readFile(
      path.join(profilesRoot, id, layout.assetPath),
    );
    const gltf = JSON.parse(
      buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
    );
    const names = new Set(gltf.nodes.map((node) => node.name));
    for (const component of Object.values(layout.components)) {
      for (const [key, response] of Object.entries(component.visualResponses)) {
        const required = [
          response.valueNodeName,
          ...(response.valueNodeProperty === "transform"
            ? [response.minNodeName, response.maxNodeName]
            : []),
        ];
        if (required.some((name) => !names.has(name)))
          delete component.visualResponses[key];
      }
    }
  }
  await writeFile(
    path.join("public/xr-profiles", id, "profile.json"),
    JSON.stringify(profile),
  );
}
await writeFile(
  "public/xr-profiles/profilesList.json",
  JSON.stringify(included),
);
await copyFile(
  path.join(assetsRoot, "LICENSE.md"),
  "public/xr-profiles/LICENSE.md",
);
console.log("Prepared locally hosted Quest Touch Plus controller profiles.");
await prepareReferences();

await prepareSpatial();
