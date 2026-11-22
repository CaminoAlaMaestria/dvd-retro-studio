import { useEffect, useState } from "react";
import { getMedia, getMovie, getSlideshow, listMovies, listSlideshows, onDbChange } from "./db.js";

const urlCache = new Map();

/** Resuelve una fuente (URL externa o blob local) a una URL reproducible. */
export async function resolveSrc(src) {
  if (!src) return undefined;
  if (src.url) return src.url;
  if (!src.mediaId) return undefined;
  const hit = urlCache.get(src.mediaId);
  if (hit) return hit;
  const rec = await getMedia(src.mediaId);
  if (!rec) return undefined;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(src.mediaId, url);
  return url;
}

export function useSrc(src) {
  const [url, setUrl] = useState(src?.url);
  const key = src?.url ?? src?.mediaId;
  useEffect(() => {
    let live = true;
    setUrl(src?.url);
    resolveSrc(src).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

export function fmtTime(sec, hours = true) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return hours ? `${p(h)}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

/** Captura un fotograma (póster) de un vídeo a partir de su URL. */
export function videoPoster(url, at = 0.5) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    const fail = () => reject(new Error("No se pudo leer el vídeo"));
    v.onerror = fail;
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(at, Math.max(0.05, (v.duration || 1) / 2));
    };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = Math.round((480 * (v.videoHeight || 270)) / (v.videoWidth || 480));
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("Canvas no disponible"));
      ctx.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(
        (b) => (b ? resolve({ blob: b, duration: Number.isFinite(v.duration) ? v.duration : 0 }) : reject(new Error("No se pudo crear el póster"))),
        "image/jpeg",
        0.85
      );
    };
  });
}

/** Hooks reactivos que se refrescan cuando la base de datos local cambia. */
function useLive(fn, deps) {
  const [v, setV] = useState(undefined);
  useEffect(() => {
    let live = true;
    const run = () => fn().then((r) => live && setV(r));
    run();
    const off = onDbChange(run);
    return () => {
      live = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}
export const useMovies = () => useLive(listMovies, []);
export const useSlideshows = () => useLive(listSlideshows, []);
export const useMovie = (id) => useLive(() => (id ? getMovie(id) : Promise.resolve(undefined)), [id]);
export const useSlideshow = (id) => useLive(() => (id ? getSlideshow(id) : Promise.resolve(undefined)), [id]);

/** Mini sistema de avisos (toast) sin dependencias. */
const toastListeners = new Set();
export function toast(message, kind = "ok") {
  const id = Math.random().toString(36).slice(2);
  toastListeners.forEach((fn) => fn({ id, message, kind }));
  setTimeout(() => toastListeners.forEach((fn) => fn({ id, remove: true })), 4200);
}
export function onToast(fn) {
  toastListeners.add(fn);
  return () => toastListeners.delete(fn);
}
