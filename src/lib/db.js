/* ============================================================
   Base de datos local (IndexedDB) — todo queda en el dispositivo.
   Películas, pases de fotos y blobs de medios (vídeo, audio, fotos).
   ============================================================ */

const DB_NAME = "dvd-retro-studio";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("movies")) db.createObjectStore("movies", { keyPath: "id" });
      if (!db.objectStoreNames.contains("slideshows")) db.createObjectStore("slideshows", { keyPath: "id" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const out = fn(s);
        t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("Transacción cancelada"));
      })
  );
}

const getAll = (store) => tx(store, "readonly", (s) => s.getAll());
const getOne = (store, key) => tx(store, "readonly", (s) => s.get(key));
const putOne = (store, value, key) => tx(store, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key)));
const delOne = (store, key) => tx(store, "readwrite", (s) => s.delete(key));

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const shareCode = () => `DVD-${Math.floor(1000 + Math.random() * 9000)}`;

/* --- avisos de cambio (para refrescar la UI en vivo) --- */
const listeners = new Set();
export function onDbChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((l) => l());

/* --- películas --- */
export async function listMovies() {
  const all = (await getAll("movies")) || [];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}
export const getMovie = (id) => getOne("movies", id);
export async function saveMovie(m) {
  await putOne("movies", m);
  emit();
}
export async function deleteMovie(id) {
  await delOne("movies", id);
  emit();
}

/* --- pases de fotos --- */
export async function listSlideshows() {
  const all = (await getAll("slideshows")) || [];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}
export const getSlideshow = (id) => getOne("slideshows", id);
export async function saveSlideshow(s) {
  await putOne("slideshows", s);
  emit();
}
export async function deleteSlideshow(id) {
  await delOne("slideshows", id);
  emit();
}

/* --- medios (blobs) --- */
export async function putMedia(blob, name, id = uid()) {
  await putOne("media", { id, blob, type: blob.type, name });
  return id;
}
export const getMedia = (id) => getOne("media", id);
export async function deleteMedia(id) {
  await delOne("media", id);
  emit();
}

/* --- metadatos (ajustes) --- */
export const getMeta = (key) => getOne("meta", key);
export async function setMeta(key, v) {
  await putOne("meta", v, key);
  emit();
}

/* --- conteo de uso (para la biblioteca) --- */
export async function storageUsage() {
  const media = (await getAll("media")) || [];
  return media.reduce((n, m) => n + (m.blob?.size || 0), 0);
}
