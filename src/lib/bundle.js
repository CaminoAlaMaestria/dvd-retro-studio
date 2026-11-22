import { getMedia, listMovies, listSlideshows, putMedia, saveMovie, saveSlideshow, uid } from "./db.js";

/* ============================================================
   Disco virtual ".dvd": un único archivo JSON con los medios
   incrustados en base64. Se puede enviar por WhatsApp, Drive,
   correo… y se importa en cualquier navegador.
   ============================================================ */

function collectSrcs(items) {
  const out = [];
  for (const it of items) {
    if (it.kind === "movie") {
      out.push(it.cover, ...(it.video ? [it.video] : []), ...it.photos);
      it.chapters.forEach((c) => out.push(c.poster, ...(c.clip ? [c.clip] : []), ...(c.voiceOver ? [c.voiceOver] : [])));
    } else {
      out.push(...it.photos);
      if (it.music.kind === "own") out.push({ mediaId: it.music.mediaId });
    }
  }
  return out;
}

const blobToB64 = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

const b64ToBlob = (s, type) => {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
};

/** Las imágenes de demostración (URLs) también se incrustan en el disco. */
async function embedUrl(src, media, urls) {
  if (src.url && !src.mediaId) {
    const known = urls.get(src.url);
    if (known) {
      src.mediaId = known;
      delete src.url;
      return;
    }
    const response = await fetch(src.url);
    if (!response.ok) throw new Error("No se pudo incluir un archivo del disco");
    const b = await response.blob();
    const id = "u" + uid();
    urls.set(src.url, id);
    media.push({ id, type: b.type, data: await blobToB64(b) });
    src.mediaId = id;
    delete src.url;
  }
}

export async function buildBundle(scope) {
  const movies = await listMovies();
  const slides = await listSlideshows();
  let ms = [], ss = [], title = "Biblioteca";
  if (scope.type === "all") {
    ms = movies;
    ss = slides;
  } else if (scope.type === "movie") {
    ms = movies.filter((m) => m.id === scope.id);
    ss = slides.filter((s) => ms[0]?.linkedSlideshows.includes(s.id));
    title = ms[0]?.title ?? "Película";
  } else {
    ss = slides.filter((s) => s.id === scope.id);
    title = ss[0]?.title ?? "Pase";
  }
  const items = structuredClone([...ms, ...ss]);
  const media = [];
  const srcs = collectSrcs(items);
  const urls = new Map();
  for (const s of srcs) await embedUrl(s, media, urls);
  for (const s of srcs) {
    if (s.mediaId && !media.find((m) => m.id === s.mediaId)) {
      const rec = await getMedia(s.mediaId);
      if (!rec) throw new Error("Falta un archivo guardado. El disco no se ha exportado incompleto.");
      media.push({ id: rec.id, type: rec.type, name: rec.name, data: await blobToB64(rec.blob) });
    }
  }
  const bundle = {
    format: "dvd-retro-studio",
    version: 2,
    title,
    movies: items.filter((i) => i.kind === "movie"),
    slideshows: items.filter((i) => i.kind === "slideshow"),
    media,
  };
  const safe = title.replace(/[^\w\-áéíóúñ ]/gi, "").trim().replace(/\s+/g, "-") || "disco";
  return { blob: new Blob([JSON.stringify(bundle)], { type: "application/json" }), filename: `${safe}.dvd` };
}

export async function importBundle(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("El archivo no es un disco .dvd válido");
  }
  if (data.format !== "dvd-retro-studio") throw new Error("El archivo no es un disco .dvd válido");
  for (const m of data.media) await putMedia(b64ToBlob(m.data, m.type), m.name, m.id);
  for (const m of data.movies) await saveMovie({ ...m, createdAt: Date.now() });
  for (const s of data.slideshows) await saveSlideshow({ ...s, createdAt: Date.now() });
  return { movies: data.movies.length, slideshows: data.slideshows.length, firstMovie: data.movies[0]?.id };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
