import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { makeRobot } from "../src/scene/demos.js";
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
