const MAX_BYTES = 100 * 1024 * 1024;

export async function downloadModel(url, { signal, onProgress, expectedBytes, maxBytes = MAX_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 250 * 1024 ** 2)
    throw new Error("Некорректный лимит загрузки.");
  const tooLarge = () => new Error(`Файл превышает ${Math.round(maxBytes / 1024 ** 2)} МБ.`);
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(180000)])
      : AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Сервер вернул HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length"));
  if (length > maxBytes) throw tooLarge();
  const total = expectedBytes || length;
  onProgress?.(0);
  if (!response.body) {
    const data = await response.arrayBuffer();
    if (data.byteLength > maxBytes) throw tooLarge();
    if (expectedBytes && data.byteLength !== expectedBytes)
      throw new Error("Файл загружен не полностью. Попробуйте ещё раз.");
    onProgress?.(1);
    return data;
  }
  const reader = response.body.getReader(), chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw tooLarge();
      chunks.push(value);
      onProgress?.(total ? Math.min(0.99, received / total) : null);
    }
    if (expectedBytes && received !== expectedBytes)
      throw new Error("Файл загружен не полностью. Попробуйте ещё раз.");
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    onProgress?.(1);
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
