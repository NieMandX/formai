// Detect Gaussian PLY by its vertex schema, never by the .ply extension alone.
export function gaussianPlyInfo(data) {
  const bytes = new Uint8Array(data);
  const header = new TextDecoder().decode(bytes.subarray(0, 65536));
  const end = header.indexOf("end_header");
  if (!header.startsWith("ply\n") && !header.startsWith("ply\r\n")) return null;
  if (end < 0) throw new Error("Повреждён заголовок PLY.");
  const lines = header.slice(0, end).split(/\r?\n/);
  const properties = [];
  let vertex = false, count = 0;
  for (const line of lines) {
    const words = line.trim().split(/\s+/);
    if (words[0] === "element") {
      vertex = words[1] === "vertex";
      if (vertex) count = Number(words[2]);
    } else if (vertex && words[0] === "property") properties.push(words.slice(1));
  }
  const names = new Set(properties.map(p => p[1]));
  const required = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
    "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
  if (!required.every(p => names.has(p))) return null;
  if (!lines.includes("format binary_little_endian 1.0") || properties.some(p => p[0] !== "float"))
    throw new Error("Gaussian PLY должен быть binary little-endian с float32-полями.");
  if (!Number.isSafeInteger(count) || count <= 0 || count > 2_000_000)
    throw new Error("Для Quest поддерживается до 2 миллионов сплатов в одном PLY.");
  const headerBytes = header.indexOf("\n", end) + 1;
  if (!headerBytes || bytes.byteLength < headerBytes + count * properties.length * 4)
    throw new Error("Файл Gaussian PLY загружен не полностью.");
  return { count, headerBytes };
}
