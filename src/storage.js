const dbPromise =
  typeof indexedDB === "undefined"
    ? null
    : new Promise((resolve, reject) => {
        const request = indexedDB.open("forma-models", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("bundles", { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
async function operation(mode, action) {
  const db = await dbPromise;
  if (!db) throw new Error("Хранилище недоступно");
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bundles", mode);
    const request = action(tx.objectStore("bundles"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const savedModels = () =>
  operation("readonly", (store) => store.getAll());
export const saveModel = (bundle) =>
  operation("readwrite", (store) => store.put(bundle));
export const deleteModel = (id) =>
  operation("readwrite", (store) => store.delete(id));
