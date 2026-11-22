/* ============================================================
   Capítulos para TV/USB: planificación de segmentos,
   subtítulos .srt con nombres de escena e inyección de caja
   "chpl" (Nero/MP4) en el encabezado moov para saltar con |<< >>|.
   ============================================================ */

export function planTvSegments(movie) {
  const list = [...(movie.chapters || [])].sort((a, b) => a.start - b.start);
  if (!list.length && movie.video) {
    return [{ title: movie.title || "Película", at: 0, length: Math.max(1, movie.duration || 5), source: "movie", offset: 0 }];
  }
  return list.map((c, i) => {
    const end = list[i + 1]?.start ?? movie.duration;
    const length = Math.max(0.5, (c.clip ? c.clipDuration ?? end - c.start : end - c.start) || 5);
    return {
      title: c.title,
      at: c.start,
      length,
      source: c.clip ? "clip" : movie.video ? "movie" : "image",
      offset: c.clip ? 0 : c.start,
    };
  });
}

export function chapterMarks(segs) {
  let t = 0;
  return segs.map((s) => {
    const m = { title: s.title, at: t };
    t += s.length;
    return m;
  });
}

const srtTime = (sec) => {
  const ms = Math.round(sec * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Archivo .srt que muestra el nombre de cada capítulo durante 4 s al empezar. */
export function chaptersSrt(marks) {
  return marks.map((m, i) => `${i + 1}\n${srtTime(m.at)} --> ${srtTime(m.at + 4)}\n${m.title}\n`).join("\n");
}

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type, body) => [...u32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];

export function chplBox(marks) {
  const enc = new TextEncoder();
  const body = [1, 0, 0, 0, 0, 0, 0, 0, Math.min(255, marks.length)];
  for (const m of marks.slice(0, 255)) {
    const t = BigInt(Math.round(m.at * 1e7));
    for (let s = 56n; s >= 0n; s -= 8n) body.push(Number((t >> s) & 255n));
    const title = [...enc.encode(m.title)].slice(0, 255);
    body.push(title.length, ...title);
  }
  return box("udta", box("chpl", body));
}

/** Inserta la tabla de capítulos en un MP4 (moov/udta/chpl); si no hay moov, devuelve igual. */
export function addMp4Chapters(bytes, marks) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  while (off + 8 <= bytes.length) {
    const size = view.getUint32(off);
    const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    if (size < 8) break;
    if (type === "moov") {
      const extra = Uint8Array.from(chplBox(marks));
      const out = new Uint8Array(bytes.length + extra.length);
      out.set(bytes.subarray(0, off + size), 0);
      out.set(extra, off + size);
      out.set(bytes.subarray(off + size), off + size + extra.length);
      new DataView(out.buffer).setUint32(off, size + extra.length);
      return out;
    }
    off += size;
  }
  return bytes;
}
