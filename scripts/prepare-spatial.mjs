import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { SPATIAL_MODELS } from "../src/spatial-catalog.js";

export async function prepareSpatial() {
  const directory = new URL("../public/models/spatial/", import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const model of SPATIAL_MODELS) {
    const target = new URL(model.file, directory);
    const valid = bytes => bytes?.length === model.bytes &&
      createHash("sha256").update(bytes).digest("hex") === model.sha256;
    if (valid(await readFile(target).catch(() => null))) continue;
    const response = await fetch(`https://github.com/NieMandX/formai/releases/download/${model.release}/${model.file}`,
      { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${model.file}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes)) throw new Error(`${model.file}: checksum mismatch`);
    const temporary = new URL(model.file + ".tmp", directory);
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  }
  console.log(`Prepared ${SPATIAL_MODELS.length} original Gaussian PLY model(s).`);
}
