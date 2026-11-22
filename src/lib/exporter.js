import { getMedia, listMovies, listSlideshows, putMedia, saveMovie, saveSlideshow } from "./db.js";
import { resolveSrc } from "./media.js";
import { getAudioCtx } from "./audio.js";
import { addMp4Chapters, chapterMarks, chaptersSrt, planTvSegments } from "./tv-chapters.js";
import { createZip, readZip } from "./zip.js";

/* ============================================================
   Exportación con archivos estándar (MP4/WebM/HTML/JPG/MP3/ZIP):
   compatibles con televisores, móviles y ordenadores.
   - Película con vídeo principal → descarga directa del archivo.
   - Película para USB/TV → MP4 H.264 (si el navegador lo admite)
     con capítulos reales "chpl" + archivo .srt de escenas.
   - Reproductor autónomo .html → menú DVD + escenas en 1 archivo.
   - Película de clips / pase de fotos → vídeo con su audio.
   - Biblioteca → ZIP con los archivos originales + manifiesto.
   ============================================================ */

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

export const slug = (s) => String(s || "").replace(/[^\w\-áéíóúñ ]/gi, "").trim().replace(/\s+/g, "-") || "disco";

const EXT = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/ogg": ".ogv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
};
const extFor = (type) => EXT[type] || ".bin";

const pickMime = () =>
  MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";

/** Elige MP4 H.264/AAC primero (el formato estándar que leen los televisores por USB). */
export function tvRecordingType() {
  for (const t of [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/** Dibuja una imagen/vídeo cubriendo el lienzo (recorte centrado). */
function drawCover(x, el, W, H, scale = 1, panX = 0, panY = 0) {
  const iw = el.videoWidth || el.naturalWidth || W;
  const ih = el.videoHeight || el.naturalHeight || H;
  const base = Math.max(W / iw, H / ih) * scale;
  const w = iw * base;
  const h = ih * base;
  x.drawImage(el, (W - w) / 2 + panX, (H - h) / 2 + panY, w, h);
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("No se pudo cargar una foto"));
    img.src = url;
  });
}

/* ---------- descarga directa del vídeo principal ---------- */
export async function downloadMovieFile(movie) {
  if (!movie.video?.mediaId) throw new Error("Esta película no tiene vídeo principal. Usa «Generar vídeo» para crear un único archivo.");
  const rec = await getMedia(movie.video.mediaId);
  if (!rec) throw new Error("Falta el archivo de vídeo guardado");
  downloadBlob(rec.blob, `${slug(movie.title)}${extFor(rec.type)}`);
}

/* ---------- render de película: clips/capítulos → un solo vídeo ---------- */
export async function renderMovieVideo(movie, onProgress) {
  const segs = [];
  const clipChapters = movie.chapters.filter((c) => c.clip);
  if (clipChapters.length) {
    for (const c of clipChapters) segs.push({ src: c.clip, start: 0, end: c.clipDuration ?? 0, voiceOver: c.voiceOver });
  } else if (movie.video) {
    movie.chapters.forEach((c, i) => {
      const end = movie.chapters[i + 1]?.start ?? movie.duration;
      if (end > c.start) segs.push({ src: movie.video, start: c.start, end, voiceOver: c.voiceOver });
    });
    if (!segs.length) segs.push({ src: movie.video, start: 0, end: movie.duration });
  }
  if (!segs.length) throw new Error("No hay vídeo que exportar");
  const total = segs.reduce((n, s) => n + (s.end - s.start), 0) || 1;

  const W = 1280, H = 720;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const x = canvas.getContext("2d");
  const actx = getAudioCtx();
  const dest = actx.createMediaStreamDestination();
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: pickMime() });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start(250);

  let elapsed = 0;
  for (const seg of segs) {
    const url = await resolveSrc(seg.src);
    if (!url) continue;
    const v = document.createElement("video");
    v.src = url;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    const srcNode = actx.createMediaElementSource(v);
    srcNode.connect(dest);
    let voEl = null, voNode = null;
    if (seg.voiceOver) {
      const voUrl = await resolveSrc(seg.voiceOver);
      if (voUrl) {
        voEl = document.createElement("audio");
        voEl.src = voUrl;
        voNode = actx.createMediaElementSource(voEl);
        voNode.connect(dest);
      }
    }
    await new Promise((res, rej) => {
      v.onloadedmetadata = res;
      v.onerror = rej;
    });
    if (seg.start > 0) {
      v.currentTime = seg.start;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    }
    const segDur = seg.end - seg.start;
    await new Promise((res) => {
      const tick = () => {
        if (v.currentTime >= seg.end || v.ended) return res();
        x.fillStyle = "#000";
        x.fillRect(0, 0, W, H);
        drawCover(x, v, W, H);
        onProgress?.(Math.min(1, (elapsed + Math.max(0, v.currentTime - seg.start)) / total));
        requestAnimationFrame(tick);
      };
      v.play().catch(() => {});
      voEl?.play().catch(() => {});
      tick();
    });
    v.pause();
    voEl?.pause();
    try { srcNode.disconnect(); } catch { /* noop */ }
    try { voNode?.disconnect(); } catch { /* noop */ }
    elapsed += segDur;
  }
  rec.stop();
  await done;
  return new Blob(chunks, { type: rec.mimeType });
}

/* ---------- música libre renderizada a buffer (para exportar) ---------- */
const FREE_CHORDS = {
  amanecer: { bpm: 72, chords: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]] },
  noche: { bpm: 60, chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]] },
  aventura: { bpm: 104, chords: [[43, 47, 50], [48, 52, 55], [50, 54, 57], [40, 43, 47]] },
};

async function renderFreeTrack(trackId, seconds) {
  const t = FREE_CHORDS[trackId] || FREE_CHORDS.amanecer;
  const sr = 44100;
  const off = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const master = off.createGain();
  master.gain.value = 0.25;
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3000;
  master.connect(lp).connect(off.destination);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const note = (m, start, dur, vol, wave) => {
    const o = off.createOscillator();
    const g = off.createGain();
    o.type = wave;
    o.frequency.value = hz(m);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + Math.min(0.1, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    o.connect(g).connect(master);
    o.start(start);
    o.stop(start + dur + 0.05);
  };
  const bar = (60 / t.bpm) * 4;
  const bars = Math.ceil(seconds / bar);
  for (let b = 0; b < bars; b++) {
    const ch = t.chords[b % t.chords.length];
    const s = b * bar;
    ch.forEach((m) => note(m, s, bar * 0.98, 0.1, "triangle"));
    note(ch[0] - 12, s, bar * 0.9, 0.22, "sine");
    const step = bar / 8;
    for (let k = 0; k < 8; k++) note(ch[k % ch.length] + 12, s + k * step, step * 1.4, 0.06, "sine");
  }
  return off.startRendering();
}

/* ---------- render de pase de fotos → vídeo con música ---------- */
export async function renderSlideshowVideo(show, onProgress) {
  const urls = [];
  for (const p of show.photos) {
    const u = await resolveSrc(p);
    if (u) urls.push(u);
  }
  if (!urls.length) throw new Error("El pase no tiene fotos");
  const imgs = await Promise.all(urls.map(loadImage));

  const W = 1280, H = 720;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const x = canvas.getContext("2d");
  const actx = getAudioCtx();
  const dest = actx.createMediaStreamDestination();

  const per = show.seconds || 4;
  const total = per * imgs.length;

  const stoppers = [];
  if (show.music.kind === "free") {
    const buf = await renderFreeTrack(show.music.trackId, total);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const g = actx.createGain();
    g.gain.value = 0.6;
    src.connect(g).connect(dest);
    src.start();
    stoppers.push(() => { try { src.stop(); } catch { /* noop */ } });
  } else if (show.music.kind === "own") {
    const u = await resolveSrc({ mediaId: show.music.mediaId });
    if (u) {
      const a = new Audio(u);
      a.loop = true;
      const n = actx.createMediaElementSource(a);
      const g = actx.createGain();
      g.gain.value = 0.6;
      n.connect(g).connect(dest);
      a.play().catch(() => {});
      stoppers.push(() => a.pause());
    }
  }

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: pickMime() });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start(250);

  const trans = 0.8;
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) return res();
      const idx = Math.min(imgs.length - 1, Math.floor(t / per));
      const local = t - idx * per;
      const kb = 1.02 + 0.16 * (local / per);
      const panX = -14 * (local / per);
      x.fillStyle = "#000";
      x.fillRect(0, 0, W, H);
      if (idx > 0 && local < trans) {
        drawCover(x, imgs[idx - 1], W, H, 1.18, -14);
        const p = local / trans;
        x.save();
        if (show.transition === "wipe") {
          x.beginPath();
          x.rect(0, 0, W * p, H);
          x.clip();
        } else if (show.transition === "iris") {
          x.beginPath();
          x.arc(W / 2, H / 2, Math.max(W, H) * 0.75 * p, 0, Math.PI * 2);
          x.clip();
        } else {
          x.globalAlpha = p;
        }
        drawCover(x, imgs[idx], W, H, kb, panX);
        x.restore();
      } else {
        drawCover(x, imgs[idx], W, H, kb, panX);
      }
      onProgress?.(Math.min(1, t / total));
      requestAnimationFrame(tick);
    };
    tick();
  });

  stoppers.forEach((s) => s());
  rec.stop();
  await done;
  return new Blob(chunks, { type: rec.mimeType });
}

/* ---------- biblioteca → ZIP con archivos estándar + manifiesto ---------- */
export async function buildLibraryZip(scope) {
  const movies = await listMovies();
  const slides = await listSlideshows();
  let ms = [], ss = [];
  if (scope.type === "all") {
    ms = movies;
    ss = slides;
  } else if (scope.type === "movie") {
    ms = movies.filter((m) => m.id === scope.id);
    ss = slides.filter((s) => ms[0]?.linkedSlideshows.includes(s.id));
  } else {
    ss = slides.filter((s) => s.id === scope.id);
  }

  const files = [];
  const manifest = { format: "dvd-retro-studio-library", version: 1, movies: [], slideshows: [], files: {} };

  const addSrc = async (src, folder, base) => {
    if (!src) return src;
    let blob, type, name;
    if (src.mediaId) {
      const rec = await getMedia(src.mediaId);
      if (!rec) throw new Error("Falta un archivo guardado. El paquete no se ha creado incompleto.");
      blob = rec.blob;
      type = rec.type;
      name = rec.name || base;
    } else if (src.url) {
      const r = await fetch(src.url);
      if (!r.ok) throw new Error("No se pudo incluir un archivo del paquete");
      blob = await r.blob();
      type = blob.type;
      name = base;
    } else return {};
    const path = `${folder}/${base}${extFor(type)}`;
    files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
    manifest.files[path] = { type, name };
    return { file: path };
  };

  for (const m of ms) {
    const folder = `peliculas/${slug(m.title)}`;
    const mm = structuredClone(m);
    mm.cover = await addSrc(m.cover, folder, "portada");
    if (m.video) mm.video = await addSrc(m.video, folder, "video");
    mm.photos = [];
    for (let i = 0; i < m.photos.length; i++) mm.photos.push(await addSrc(m.photos[i], folder, `foto-${i + 1}`));
    for (const c of mm.chapters) {
      c.poster = await addSrc(c.poster, folder, `capitulo-${slug(c.title)}`);
      if (c.clip) c.clip = await addSrc(c.clip, folder, `clip-${slug(c.title)}`);
      if (c.voiceOver) c.voiceOver = await addSrc(c.voiceOver, folder, `voz-${slug(c.title)}`);
    }
    manifest.movies.push(mm);
  }
  for (const s of ss) {
    const folder = `pases/${slug(s.title)}`;
    const ss2 = structuredClone(s);
    ss2.photos = [];
    for (let i = 0; i < s.photos.length; i++) ss2.photos.push(await addSrc(s.photos[i], folder, `foto-${i + 1}`));
    if (s.music.kind === "own") {
      const added = await addSrc({ mediaId: s.music.mediaId }, folder, "musica");
      ss2.music = { kind: "own", file: added.file, name: s.music.name };
    }
    manifest.slideshows.push(ss2);
  }

  files.push({ name: "biblioteca.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  const title = scope.type === "all" ? "biblioteca" : ms[0]?.title || ss[0]?.title || "disco";
  return { blob: new Blob([createZip(files)], { type: "application/zip" }), filename: `${slug(title)}.zip` };
}

/* ---------- importar ZIP de biblioteca ---------- */
export async function importLibraryZip(file) {
  const entries = await readZip(file);
  const manEntry = entries.find((e) => e.name === "biblioteca.json");
  if (!manEntry) throw new Error("El ZIP no contiene biblioteca.json");
  const manifest = JSON.parse(new TextDecoder().decode(manEntry.data));
  if (manifest.format !== "dvd-retro-studio-library") throw new Error("El ZIP no es una biblioteca de DVD Retro Studio");
  const byPath = new Map();
  for (const e of entries) {
    if (e.name === "biblioteca.json") continue;
    const meta = manifest.files[e.name] || {};
    const id = await putMedia(new Blob([e.data], { type: meta.type || "application/octet-stream" }), meta.name || e.name.split("/").pop());
    byPath.set(e.name, id);
  }
  const fix = (src) => (src?.file ? { mediaId: byPath.get(src.file) } : src);
  for (const m of manifest.movies) {
    const mm = { ...m, createdAt: Date.now() };
    mm.cover = fix(m.cover);
    if (m.video) mm.video = fix(m.video);
    mm.photos = (m.photos || []).map(fix);
    mm.chapters = (m.chapters || []).map((c) => ({
      ...c,
      poster: fix(c.poster),
      clip: c.clip ? fix(c.clip) : undefined,
      voiceOver: c.voiceOver ? fix(c.voiceOver) : undefined,
    }));
    await saveMovie(mm);
  }
  for (const s of manifest.slideshows) {
    const ss = { ...s, createdAt: Date.now(), photos: (s.photos || []).map(fix) };
    if (s.music?.kind === "own") ss.music = { kind: "own", mediaId: byPath.get(s.music.file), name: s.music.name };
    await saveSlideshow(ss);
  }
  return { movies: manifest.movies.length, slideshows: manifest.slideshows.length };
}

/* ---------- exportar para USB / TV (MP4 con capítulos + .srt) ---------- */
function fitContain(x, el, w, h) {
  const W = 1280, H = 720;
  const s = Math.min(W / (w || W), H / (h || H));
  x.fillStyle = "#000";
  x.fillRect(0, 0, W, H);
  x.drawImage(el, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
}

export async function exportForTv(movie, onProgress, signal) {
  const type = tvRecordingType();
  if (!type) throw new Error("Este navegador no puede crear vídeo");
  const segs = planTvSegments(movie);
  if (!segs.length) throw new Error("La película no tiene escenas");
  const total = segs.reduce((a, s) => a + s.length, 0) || 1;

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  const ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === "suspended") await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = () => r()));
  const ordered = [...(movie.chapters || [])].sort((a, b) => a.start - b.start);
  rec.start(1000);

  let done = 0;
  try {
    for (const [i, seg] of segs.entries()) {
      if (signal?.aborted) throw new Error("Exportación cancelada");
      const ch = ordered[i];
      const voiceUrl = await resolveSrc(ch?.voiceOver);
      const voice = voiceUrl ? new Audio(voiceUrl) : null;
      if (voice) ac.createMediaElementSource(voice).connect(dest);

      if (seg.source === "image") {
        const url = await resolveSrc(ch?.poster || movie.cover);
        const img = url ? await loadImage(url) : null;
        voice?.play().catch(() => {});
        const t0 = performance.now();
        await new Promise((res) => {
          const tick = () => {
            const e = (performance.now() - t0) / 1000;
            if (img) fitContain(ctx, img, img.naturalWidth, img.naturalHeight);
            else {
              ctx.fillStyle = "#05070d";
              ctx.fillRect(0, 0, 1280, 720);
            }
            onProgress?.(Math.min(1, (done + Math.min(e, seg.length)) / total));
            if (e >= seg.length || signal?.aborted) res();
            else requestAnimationFrame(tick);
          };
          tick();
        });
      } else {
        const url = await resolveSrc(seg.source === "clip" ? ch?.clip : movie.video);
        if (!url) throw new Error(`Falta el vídeo de «${seg.title}»`);
        const v = document.createElement("video");
        v.src = url;
        v.playsInline = true;
        v.crossOrigin = "anonymous";
        await new Promise((r, j) => {
          v.onloadedmetadata = r;
          v.onerror = () => j(new Error(`No se pudo abrir «${seg.title}»`));
        });
        v.currentTime = seg.offset;
        await new Promise((r) => (v.onseeked = r));
        ac.createMediaElementSource(v).connect(dest);
        await v.play();
        voice?.play().catch(() => {});
        await new Promise((res) => {
          const tick = () => {
            const e = v.currentTime - seg.offset;
            fitContain(ctx, v, v.videoWidth, v.videoHeight);
            onProgress?.(Math.min(1, (done + Math.min(e, seg.length)) / total));
            if (e >= seg.length || v.ended || signal?.aborted) res();
            else requestAnimationFrame(tick);
          };
          tick();
        });
        v.pause();
      }
      voice?.pause();
      done += seg.length;
    }
  } finally {
    if (rec.state !== "inactive") rec.stop();
    await stopped;
    ac.close().catch(() => {});
  }
  if (signal?.aborted) throw new Error("Exportación cancelada");

  const marks = chapterMarks(segs);
  const mp4 = type.startsWith("video/mp4");
  let video = new Blob(chunks, { type: mp4 ? "video/mp4" : "video/webm" });
  if (mp4) {
    const buf = addMp4Chapters(new Uint8Array(await video.arrayBuffer()), marks);
    video = new Blob([buf], { type: "video/mp4" });
  }
  const base = slug(movie.title);
  return {
    video,
    videoName: `${base}.${mp4 ? "mp4" : "webm"}`,
    srt: new Blob([chaptersSrt(marks)], { type: "text/plain;charset=utf-8" }),
    srtName: `${base}.srt`,
    mp4,
  };
}

/* ---------- exportar reproductor autónomo (.html offline) ---------- */
const toDataUrl = async (src) => {
  const url = await resolveSrc(src);
  if (!url) return "";
  const blob = await (await fetch(url)).blob();
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
};

const escHtml = (s) =>
  String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export async function exportStandaloneHtml(movie, onProgress) {
  const segs = planTvSegments(movie);
  if (!segs.length) throw new Error("La película no tiene escenas");
  const ordered = [...(movie.chapters || [])].sort((a, b) => a.start - b.start);
  const movieVideo = movie.video ? await toDataUrl(movie.video) : "";
  const scenes = [];
  for (const [i, s] of segs.entries()) {
    const ch = ordered[i];
    const poster = await toDataUrl(ch?.poster || movie.cover);
    const video = s.source === "clip" ? await toDataUrl(ch?.clip) : s.source === "movie" ? "MOVIE" : "";
    if (s.source !== "image" && !video) throw new Error(`Falta el vídeo de «${s.title}»`);
    scenes.push({
      title: s.title,
      offset: s.offset,
      length: s.length,
      poster,
      video,
      voice: await toDataUrl(ch?.voiceOver),
    });
    onProgress?.((i + 1) / segs.length);
  }
  const cover = await toDataUrl(movie.cover);
  const data = JSON.stringify({ title: movie.title, subtitle: movie.subtitle, cover, movieVideo, scenes }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(movie.title)}</title>
<style>
:root{--bg:#05070d;--gold:#e3c15c;--cyan:#6fd3f2;--ink:#e9eef7;--muted:#8b94a7;--panel:#0d1220}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,sans-serif;min-height:100vh}
#menu{min-height:100vh;padding:5vh 5vw;background:linear-gradient(90deg,#05070df0 35%,#05070d80),var(--cover) center/cover}
h1{font-family:Georgia,serif;color:var(--gold);font-size:clamp(28px,5vw,64px);margin:0 0 .2em}p{color:var(--muted);margin:0 0 2em}
button{font:inherit;color:var(--ink);background:var(--panel);border:1px solid #e3c15c55;border-radius:10px;cursor:pointer}
button:focus{outline:none;box-shadow:0 0 0 2px var(--cyan),0 0 18px #6fd3f288;color:var(--cyan)}
.main{display:block;font-size:clamp(18px,2.4vw,26px);padding:.55em 1.1em;margin:.4em 0;min-width:280px;text-align:left}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:2.5em}
.ch{padding:0;overflow:hidden;text-align:left}.ch img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#000}.ch span{display:block;padding:8px 12px}.ch b{color:var(--gold);margin-right:8px}
#player{display:none;position:fixed;inset:0;background:#000}#player video,#player img{width:100%;height:100%;object-fit:contain}
#bar{position:absolute;left:0;right:0;bottom:0;padding:16px 24px;background:linear-gradient(transparent,#000c);display:flex;gap:12px;align-items:center}#bar button{padding:8px 14px}#t{flex:1;color:var(--gold);font-family:Georgia,serif}
</style></head><body>
<section id="menu"><h1></h1><p id="sub"></p><button class="main" id="all">▶ Reproducir Todo</button><button class="main" id="sel">Selección de Escenas</button><div id="grid"></div></section>
<section id="player"><video id="v" playsinline></video><img id="i" alt=""><div id="bar"><button id="prev">|◀◀</button><button id="pp">⏯</button><button id="next">▶▶|</button><span id="t"></span><button id="back">Menú</button></div></section>
<script>
const D=${data};const $=s=>document.getElementById(s);document.title=D.title;$("menu").style.setProperty("--cover",D.cover?"url("+D.cover+")":"none");
document.querySelector("h1").textContent=D.title;$("sub").textContent=D.subtitle||"";
D.scenes.forEach((s,i)=>{const b=document.createElement("button");b.className="ch";b.innerHTML='<img alt=""><span><b>'+String(i+1).padStart(2,"0")+'</b></span>';b.querySelector("img").src=s.poster;b.querySelector("span").append(s.title);b.onclick=()=>play(i);$("grid").append(b)});
const v=$("v"),im=$("i");let cur=-1,timer=0,voice=null;
function stop(){clearTimeout(timer);v.pause();if(voice)voice.pause();}
function play(i){stop();if(i<0||i>=D.scenes.length){menu();return}cur=i;const s=D.scenes[i];$("menu").style.display="none";$("player").style.display="block";$("t").textContent=String(i+1).padStart(2,"0")+" · "+s.title;
voice=s.voice?new Audio(s.voice):null;
if(!s.video){v.style.display="none";im.style.display="block";im.src=s.poster;voice&&voice.play();timer=setTimeout(()=>play(i+1),s.length*1000);return}
v.style.display="block";im.style.display="none";const src=s.video==="MOVIE"?D.movieVideo:s.video;if(v.dataset.src!==src){v.src=src;v.dataset.src=src}
const go=()=>{v.currentTime=s.offset;v.play();voice&&voice.play()};v.readyState>0?go():v.onloadedmetadata=go;$("pp").focus()}
v.ontimeupdate=()=>{const s=D.scenes[cur];if(s&&s.video&&(v.currentTime-s.offset>=s.length))play(cur+1)};v.onended=()=>play(cur+1);
function menu(){stop();$("player").style.display="none";$("menu").style.display="block";$("all").focus()}
$("all").onclick=()=>play(0);$("sel").onclick=()=>document.querySelector(".ch")?.focus();$("prev").onclick=()=>play(Math.max(0,cur-1));$("next").onclick=()=>play(cur+1);$("back").onclick=menu;
$("pp").onclick=()=>{if(!D.scenes[cur].video)return;v.paused?v.play():v.pause()};
addEventListener("keydown",e=>{const f=[...document.querySelectorAll("section:not([style*='none']) button")];const k=f.indexOf(document.activeElement);
if(["ArrowDown","ArrowRight"].includes(e.key)){f[(k+1)%f.length].focus();e.preventDefault()}
else if(["ArrowUp","ArrowLeft"].includes(e.key)){f[(k-1+f.length)%f.length].focus();e.preventDefault()}
else if(e.key==="Escape"||e.key==="Backspace"){menu()}else if(e.key==="MediaTrackNext")play(cur+1);else if(e.key==="MediaTrackPrevious")play(cur-1)});
menu();
</script></body></html>`;
  return { blob: new Blob([html], { type: "text/html;charset=utf-8" }), filename: `${slug(movie.title)}-reproductor.html` };
}
