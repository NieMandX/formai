import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import { REFERENCE_MODELS, REFERENCE_RELEASE } from "../src/reference-catalog.js";

// Assets live in a versioned release; each Pages site serves a bounded subset.
export async function prepareReferences() {
  const directory = new URL("../public/models/references/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const site = process.env.FORMAI_REFERENCE_SITE || "all";
  const models = REFERENCE_MODELS.filter((model) => site === "all" || (model.site || "formai") === site);
  const valid = (bytes, model) =>
    bytes.length === model.bytes &&
    createHash("sha256").update(bytes).digest("hex") === model.sha256;
  const pending = [...models];
  const prepare = async (model) => {
    const target = new URL(model.file, directory);
    const cached = await readFile(target).catch(() => null);
    if (cached && valid(cached, model)) return;
    console.log(`Downloading reference: ${model.file}`);
    const release = model.release || REFERENCE_RELEASE;
    if (!["reference-sources-v2", "reference-models-uastc-v2", "reference-models-pbr-preview-v1"].includes(release))
      throw new Error("Unexpected reference release");
    const response = await fetch(
      `https://github.com/NieMandX/formai/releases/download/${release}/${model.file}`,
      { signal: AbortSignal.timeout(180000) },
    );
    if (!response.ok) throw new Error(`${model.file}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes, model)) throw new Error(`${model.file}: checksum mismatch`);
    const temporary = new URL(model.file + ".tmp", directory);
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  };
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) await prepare(pending.shift());
  }));
  // This ignored directory contains only generated deployment copies.
  // Preserve source GLBs in local-models; remove obsolete build assets here.
  const expected = new Set(models.map((model) => model.file));
  for (const file of await readdir(directory)) {
    if ((file.endsWith(".glb") || file.endsWith(".glb.tmp")) && !expected.has(file))
      await unlink(new URL(file, directory));
  }
  const bytes = models.reduce((sum, model) => sum + model.bytes, 0);
  if (site !== "all" && bytes > 850 * 1024 ** 2) throw new Error("Reference site exceeds its size budget");
  console.log(`Prepared ${models.length} LOD0 artist references (${Math.ceil(bytes / 1048576)} MiB).`);
}
