import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { REFERENCE_MODELS, REFERENCE_RELEASE } from "../src/reference-catalog.js";

// Keep the large originals in a versioned release, not in Git history.
// Pages serves the verified copies from the same origin as the application.
export async function prepareReferences() {
  const directory = new URL("../public/models/references/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const valid = (bytes, model) =>
    bytes.length === model.bytes &&
    createHash("sha256").update(bytes).digest("hex") === model.sha256;
  for (const model of REFERENCE_MODELS) {
    const target = new URL(model.file, directory);
    const cached = await readFile(target).catch(() => null);
    if (cached && valid(cached, model)) continue;
    console.log(`Downloading original reference: ${model.file}`);
    const response = await fetch(
      `https://github.com/NieMandX/formai/releases/download/${REFERENCE_RELEASE}/${model.file}`,
      { signal: AbortSignal.timeout(180000) },
    );
    if (!response.ok) throw new Error(`${model.file}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes, model)) throw new Error(`${model.file}: checksum mismatch`);
    const temporary = new URL(model.file + ".tmp", directory);
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  }
  console.log("Prepared six original LOD0 / 8K artist references.");
}
