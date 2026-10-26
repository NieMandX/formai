import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import { SCAN_MODELS } from "../src/scan-catalog.js";

// Main Pages hosts the application; scan assets are served by Cloud.ru.
// Development can cache verified local copies.
export async function prepareScans() {
  const directory = new URL("../public/models/scans/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const local = (process.env.FORMAI_REFERENCE_SITE || "all") === "all";
  const assets = local ? SCAN_MODELS.flatMap(m => m.variants.map(v => ({ ...m, ...v }))) : [];
  for (const asset of assets) {
    if (!/^[a-z0-9-]+\.glb$/.test(asset.file) ||
        new URL(asset.url).origin !== "https://formai-models.s3.cloud.ru")
      throw new Error("Invalid scan asset");
    const target = new URL(asset.file, directory);
    const valid = data => data?.length === asset.bytes && createHash("sha256").update(data).digest("hex") === asset.sha256;
    if (valid(await readFile(target).catch(() => null))) continue;
    const response = await fetch(asset.url,
      { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (!valid(data)) throw new Error(`${asset.file}: checksum mismatch`);
    const temporary = new URL(asset.file + ".tmp", directory);
    await writeFile(temporary, data);
    await rename(temporary, target);
  }
  const expected = new Set(assets.map(a => a.file));
  for (const file of await readdir(directory)) {
    if ((file.endsWith(".glb") || file.endsWith(".glb.tmp")) && !expected.has(file))
      await unlink(new URL(file, directory));
  }
  console.log(`Prepared ${assets.length} local scan variants; production assets use their library.`);
}
