// Standalone builder for a FORMAI asset-library Pages repository.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("reference-assets.json", "utf8"));
const total = manifest.models.reduce((sum, model) => sum + model.bytes, 0);
if (total > 850 * 1024 ** 2) throw new Error("Pages asset budget exceeded");
await mkdir("dist/models/references", { recursive: true });
const queue = [...manifest.models];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const model = queue.shift();
    if (!/^[a-z0-9-]+\.glb$/.test(model.file)) throw new Error("Invalid asset filename");
    const release = model.release || manifest.release;
    if (!["reference-sources-v2", "reference-models-uastc-v2", "reference-models-pbr-preview-v1"].includes(release))
      throw new Error("Unexpected asset release");
    const response = await fetch(
      `https://github.com/NieMandX/formai/releases/download/${release}/${model.file}`,
      { signal: AbortSignal.timeout(180000) },
    );
    if (!response.ok) throw new Error(`${model.file}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== model.bytes || createHash("sha256").update(bytes).digest("hex") !== model.sha256)
      throw new Error(`${model.file}: checksum mismatch`);
    await writeFile(`dist/models/references/${model.file}`, bytes);
    console.log(`Verified ${model.file}`);
  }
}));
await writeFile("dist/.nojekyll", "");
await writeFile("dist/index.html", '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FORMAI · Библиотека</title><style>body{font:20px system-ui;max-width:600px;margin:12vh auto;padding:24px;background:#f6f5f0;color:#20251f}a{color:#44634b}</style><h1>FORMAI</h1><p>Библиотека моделей для VR-студии.</p><a href="https://niemandx.github.io/formai/">Открыть коллекцию</a></html>');
console.log(`Ready: ${manifest.models.length} models, ${total} bytes.`);
