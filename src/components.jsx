import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Clapperboard, Download, FileArchive, FileCode2, Link2, Loader2, Play, Plus, Star, Tv, Video, X } from "lucide-react";
import { useSrc, toast, onToast } from "./lib/media.js";
import { useMovies, useSlideshows } from "./lib/media.js";
import { buildLibraryZip, downloadBlob, downloadMovieFile, exportForTv, exportStandaloneHtml, renderMovieVideo, renderSlideshowVideo, slug } from "./lib/exporter.js";

/* ---------- navegación espacial para mando de TV / teclado ---------- */
const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function moveFocus(dir) {
  const d = DIRS[dir];
  if (!d) return null;
  const els = Array.from(document.querySelectorAll("[data-nav]")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.disabled;
  });
  if (!els.length) return null;
  const cur = document.activeElement;
  const curRect = cur && cur !== document.body ? cur.getBoundingClientRect() : null;
  if (!curRect) {
    els[0].focus();
    return els[0];
  }
  const cx = curRect.left + curRect.width / 2;
  const cy = curRect.top + curRect.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    if (dx * d[0] + dy * d[1] <= 0) continue;
    const primary = Math.abs(d[0] ? dx : dy);
    const secondary = Math.abs(d[0] ? dy : dx);
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) best.focus();
  return best;
}

/* ---------- botón base (con data-nav para el mando de TV) ---------- */
export function Control({ className = "", variant = "ghost", ...props }) {
  const cls = variant === "ghost" ? "" : `btn-${variant}`;
  return <button data-nav className={`btn ${cls} ${className}`} {...props} />;
}

export const MENU_LOOKS = [
  { id: "classic", label: "Clásico · DVD 2003" },
  { id: "modern", label: "Moderno · Streaming" },
  { id: "y2k", label: "Y2K · Retro 2000" },
  { id: "vhs", label: "VHS · Videoclub 90s" },
  { id: "bluray", label: "Blu-ray · Cristal" },
  { id: "cinema", label: "Cine · Cartelera 35mm" },
  { id: "neon", label: "Neón · Arcade 80s" },
];

/* ---------- cabecera global ---------- */
export function Header({ route, onNavigate, tv, onToggleTv, look, onLook }) {
  const links = [
    { id: "home", label: "Menú DVD", hash: "#/" },
    { id: "biblioteca", label: "Biblioteca", hash: "#/biblioteca" },
    { id: "estudio", label: "Estudio", hash: "#/estudio" },
    { id: "pase-nuevo", label: "Pase de fotos", hash: "#/pases/nuevo" },
  ];
  return (
    <header className="app-header">
      <div className="inner">
        <a href="#/" className="logo" data-nav aria-label="DVD Retro Studio — inicio">
          <span className="disc" aria-hidden />
          <span className="word">DVD Retro Studio</span>
        </a>
        <nav className="nav-links" aria-label="Principal">
          {links.map((l) => (
            <a key={l.id} href={l.hash} data-nav className={route === l.id ? "active" : ""}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="row header-actions" style={{ gap: 6 }}>
          <select
            aria-label="Apariencia del menú"
            className="field"
            style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
            value={look}
            onChange={(e) => onLook(e.target.value)}
          >
            {MENU_LOOKS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            data-nav
            className="btn btn-outline-cyan"
            style={{ padding: "7px 14px", fontSize: 13 }}
            onClick={onToggleTv}
            aria-pressed={tv}
            title="Modo TV (10-foot UI)"
          >
            {tv ? "TV ✓" : "Modo TV"}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- miniatura con fuente local ---------- */
export function Thumb({ src, className, alt = "", ...props }) {
  const url = useSrc(src);
  if (!url) return <div className={className} style={{ background: "linear-gradient(135deg,#1a2238,#0d1220)", ...props.style }} {...props} />;
  return <img src={url} alt={alt} className={className} loading="lazy" {...props} />;
}

/* ---------- fila de deslizador ---------- */
export function RangeRow({ label, value, onChange, min = 0, max = 100 }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label style={{ display: "block" }}>
      <span className="row" style={{ justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span className="text-muted">{label}</span>
        <span className="mono text-cyan">{value}</span>
      </span>
      <input
        data-nav
        type="range"
        className="dvd-range"
        style={{ "--p": `${pct}%` }}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/* ---------- panel de remasterización (sin créditos) ---------- */
export function RemasterPanel({ value, onChange, onApply, badge = "SIN CRÉDITOS", applyLabel = "Aplicar al disco", full = true }) {
  return (
    <section className="panel" style={{ padding: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <h2 className="font-display text-gold" style={{ fontSize: 18, margin: 0, fontVariant: "small-caps" }}>
          Remasterizar
        </h2>
        <span className="text-cyan" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".15em" }}>
          {badge}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RangeRow label="Nitidez" value={value.sharp} onChange={(v) => onChange({ ...value, sharp: v })} />
        <RangeRow label="Quitar ruido" value={value.denoise} onChange={(v) => onChange({ ...value, denoise: v })} />
        {full && <RangeRow label="Corrección de color" value={value.color} onChange={(v) => onChange({ ...value, color: v })} />}
        <RangeRow label="Filtro VHS/CRT" value={value.vhs} onChange={(v) => onChange({ ...value, vhs: v })} />
      </div>
      <Control data-nav onClick={onApply} className="btn-gold mt" style={{ width: "100%", padding: "12px" }}>
        {applyLabel}
      </Control>
      <p className="text-muted" style={{ fontSize: 12, marginTop: 10, textAlign: "center" }}>
        Se aplica en directo con la GPU. 0 créditos, 0 servidores.
      </p>
    </section>
  );
}

/* ---------- vista con remasterización WebGL (shader propio) ---------- */
const VS = `attribute vec2 p; varying vec2 v; void main(){ v=(p+1.0)*0.5; v.y=1.0-v.y; gl_Position=vec4(p,0.,1.); }`;
const FS = `precision mediump float; varying vec2 v; uniform sampler2D t; uniform vec2 px; uniform vec2 sc;
uniform float sharp, den, col, vhs, time;
float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)) + time) * 43758.5453); }
vec3 tex(vec2 u){ return texture2D(t, clamp(u, 0.0, 1.0)).rgb; }
void main(){
  vec2 u = (v - 0.5) * sc + 0.5;
  float sh = vhs * 0.004;
  vec3 c = vec3(tex(u + vec2(sh,0.)).r, tex(u).g, tex(u - vec2(sh,0.)).b);
  vec3 b = vec3(0.);
  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) b += tex(u + vec2(float(i),float(j)) * px * 1.5);
  b /= 9.0;
  c = mix(c, b, den * 0.85);
  c = c + (c - b) * sharp * 2.6;
  float l = dot(c, vec3(0.299,0.587,0.114));
  float k = (col - 0.5) * 2.0;
  c = mix(vec3(l), c, 1.0 + k * 0.6);
  c = (c - 0.5) * (1.0 + k * 0.25) + 0.5;
  float scan = 0.5 + 0.5 * sin(v.y * 900.0);
  c *= 1.0 - vhs * 0.18 * scan;
  c += (rnd(v * 500.0) - 0.5) * vhs * 0.12;
  vec2 d = v - 0.5; c *= 1.0 - vhs * 0.6 * dot(d,d) * 1.6;
  c = mix(c, c * vec3(1.05, 0.98, 0.9), vhs * 0.5);
  gl_FragColor = vec4(clamp(c,0.,1.), 1.0);
}`;

export const RemasterView = forwardRef(function RemasterView(
  { kind, src, settings, enabled, split = null, kenBurns, className, autoPlay, muted, onTime, onEnded, onLoadedMetadata, style },
  ref
) {
  const canvas = useRef(null);
  const video = useRef(null);
  const img = useRef(null);
  const s = useRef(settings);
  s.current = settings;
  useImperativeHandle(ref, () => video.current, [kind, src]);

  useEffect(() => {
    if (!enabled) return;
    const cv = canvas.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { preserveDrawingBuffer: false });
    if (!gl) return;
    const sh = (type, code) => {
      const x = gl.createShader(type);
      if (!x) return null;
      gl.shaderSource(x, code);
      gl.compileShader(x);
      return x;
    };
    const prog = gl.createProgram();
    const vs = sh(gl.VERTEX_SHADER, VS);
    const fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!prog || !vs || !fs) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tx = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tx);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((p) => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const U = (n) => gl.getUniformLocation(prog, n);
    let raf = 0;
    let uploaded = false;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const el = kind === "video" ? video.current : img.current;
      if (!el) return;
      const w = kind === "video" ? el.videoWidth : el.naturalWidth;
      const h = kind === "video" ? el.videoHeight : el.naturalHeight;
      if (!w || !h) return;
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const cw = Math.max(1, Math.round(r.width * dpr));
      const ch = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== cw || cv.height !== ch) {
        cv.width = cw;
        cv.height = ch;
        uploaded = false;
      }
      gl.viewport(0, 0, cw, ch);
      if (kind === "video" || !uploaded) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, el);
        } catch {
          return;
        }
        uploaded = true;
      }
      const ca = cw / ch;
      const sa = w / h;
      gl.uniform2f(U("sc"), ca > sa ? 1 : ca / sa, ca > sa ? sa / ca : 1);
      gl.uniform2f(U("px"), 1 / w, 1 / h);
      const st = s.current;
      gl.uniform1f(U("sharp"), st.sharp / 100);
      gl.uniform1f(U("den"), st.denoise / 100);
      gl.uniform1f(U("col"), st.color / 100);
      gl.uniform1f(U("vhs"), st.vhs / 100);
      gl.uniform1f(U("time"), (performance.now() / 1000) % 100);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteTexture(tx);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [enabled, kind, src]);

  const clip = split == null ? undefined : `inset(0 0 0 ${split}%)`;
  const kb = kenBurns ? { animation: "kenburns 14s ease-in-out infinite alternate" } : undefined;
  return (
    <div className={className} style={{ position: "relative", overflow: "hidden", background: "#000", ...style }}>
      <div style={{ position: "absolute", inset: 0, ...kb }}>
        {kind === "video" ? (
          <video
            ref={video}
            src={src}
            playsInline
            autoPlay={autoPlay}
            muted={muted}
            crossOrigin="anonymous"
            onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget)}
            onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
            onEnded={onEnded}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          src && (
            <img
              ref={img}
              src={src}
              alt=""
              crossOrigin="anonymous"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          )
        )}
        {enabled && <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", clipPath: clip }} />}
      </div>
    </div>
  );
});

/* ---------- modal para compartir (película / pase / biblioteca) ---------- */
export function ShareModal({ open, onClose, movieId, slideshowId, initial = "movie" }) {
  const movies = useMovies() ?? [];
  const slides = useSlideshows() ?? [];
  const movie = movies.find((m) => m.id === movieId) ?? movies[0];
  const [scope, setScope] = useState(initial);
  const [slideId, setSlideId] = useState(slideshowId);
  const slide = slides.find((s) => s.id === slideId) ?? slides.find((s) => movie?.linkedSlideshows.includes(s.id)) ?? slides[0];
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState("");
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (open) {
      setScope(initial);
      setSlideId(slideshowId);
      setProgress(null);
      setBusyMode("");
    }
  }, [open, initial, slideshowId]);

  const code = scope === "movie" ? movie?.shareCode : scope === "slideshow" ? slide?.shareCode : "DVD-LIB";
  const origin = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const link = `${origin}#/d/${code ?? ""}`;
  const shortLink = link.replace(/^https?:\/\//, "");

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(link, { margin: 1, width: 380, color: { dark: "#05070d", light: "#e9eef7" } }).then(setQr).catch(() => {});
  }, [open, link]);

  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Enlace copiado");
    } catch {
      toast("No se pudo copiar el enlace", "error");
    }
  };

  const downloadVideo = async () => {
    setBusy(true);
    setBusyMode("video");
    setProgress(0);
    try {
      if (scope === "movie") {
        if (movie.video) {
          await downloadMovieFile(movie);
          toast("Vídeo descargado (archivo estándar)");
        } else {
          const blob = await renderMovieVideo(movie, setProgress);
          const ext = blob.type.includes("mp4") ? "mp4" : "webm";
          downloadBlob(blob, `${slug(movie.title)}.${ext}`);
          toast("Vídeo generado y descargado");
        }
      } else if (scope === "slideshow") {
        const blob = await renderSlideshowVideo(slide, setProgress);
        downloadBlob(blob, `${slug(slide.title)}.webm`);
        toast("Pase convertido a vídeo y descargado");
      } else {
        toast("Para la biblioteca completa usa el paquete ZIP", "error");
      }
    } catch (e) {
      toast(e.message || "No se pudo generar el vídeo", "error");
    } finally {
      setBusy(false);
      setBusyMode("");
      setProgress(null);
    }
  };

  const downloadForTv = async () => {
    if (!movie) return;
    setBusy(true);
    setBusyMode("tv");
    setProgress(0);
    try {
      const r = await exportForTv(movie, setProgress);
      downloadBlob(r.video, r.videoName);
      downloadBlob(r.srt, r.srtName);
      toast(
        r.mp4
          ? `Vídeo para USB/TV listo (${r.videoName} + ${r.srtName})`
          : `Vídeo + capítulos .srt listos (${r.videoName}); si tu TV no lee WebM, usa el paquete ZIP`
      );
    } catch (e) {
      toast(e.message || "No se pudo crear el vídeo para TV", "error");
    } finally {
      setBusy(false);
      setBusyMode("");
      setProgress(null);
    }
  };

  const downloadHtml = async () => {
    if (!movie) return;
    setBusy(true);
    setBusyMode("html");
    setProgress(0);
    try {
      const r = await exportStandaloneHtml(movie, setProgress);
      downloadBlob(r.blob, r.filename);
      toast(`Reproductor autónomo listo: ${r.filename}`);
    } catch (e) {
      toast(e.message || "No se pudo crear el reproductor HTML", "error");
    } finally {
      setBusy(false);
      setBusyMode("");
      setProgress(null);
    }
  };

  const downloadZip = async () => {
    setBusy(true);
    setBusyMode("zip");
    try {
      const z = await buildLibraryZip(scope === "all" ? { type: "all" } : scope === "movie" ? { type: "movie", id: movie.id } : { type: "slideshow", id: slide.id });
      downloadBlob(z.blob, z.filename);
      toast("Paquete ZIP con archivos estándar descargado");
    } catch (e) {
      toast(e.message || "No se pudo crear el paquete", "error");
    } finally {
      setBusy(false);
      setBusyMode("");
    }
  };

  const tabs = [
    { k: "movie", label: `Película: ${movie?.title?.split(":")[0] ?? "—"}`, disabled: !movie },
    { k: "slideshow", label: `Pase: ${slide?.title ?? "—"}`, disabled: !slide },
    { k: "all", label: "Biblioteca completa", disabled: false },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-label="Compartir" onClick={(e) => e.stopPropagation()} style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 className="font-display text-gold" style={{ margin: 0, fontSize: 22 }}>
            Compartir
          </h2>
          <Control data-nav onClick={onClose} aria-label="Cerrar" className="btn-icon">
            <X />
          </Control>
        </div>
        <div style={{ padding: "18px 22px" }}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 18 }}>
            {tabs.map((t) => (
              <button key={t.k} data-nav className="chip" data-on={scope === t.k} disabled={t.disabled} onClick={() => setScope(t.k)}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 22, alignItems: "start" }} className="share-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <p className="kicker" style={{ marginBottom: 8 }}>
                  Enlace en este dispositivo
                </p>
                <div className="row" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "6px 6px 6px 14px", background: "rgba(5,7,13,.6)" }}>
                  <Link2 style={{ width: 16, height: 16, color: "var(--cyan)", flex: "none" }} />
                  <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                    {shortLink}
                  </span>
                  <Control data-nav onClick={copy} className="btn-gold" style={{ padding: "8px 16px", fontSize: 11 }}>
                    Copiar enlace
                  </Control>
                </div>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Código: <span className="mono text-cyan">{code}</span> — el enlace abre el disco si ya está importado en ese dispositivo.
                </p>
              </div>
              <div>
                <p className="kicker" style={{ marginBottom: 8 }}>
                  Archivos estándar (TV, móvil y ordenador)
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button
                    data-nav
                    onClick={downloadVideo}
                    disabled={busy || scope === "all"}
                    className="row"
                    style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel-2)", color: "var(--foreground)", gap: 14 }}
                  >
                    <Video style={{ width: 20, height: 20, color: "var(--gold)", flex: "none" }} />
                    <span className="grow">
                      <span style={{ display: "block", fontWeight: 600 }}>Descargar vídeo (MP4/WebM)</span>
                      <span className="text-muted" style={{ display: "block", fontSize: 13 }}>
                        {scope === "slideshow" ? "Convierte el pase en un vídeo con transiciones y música" : "Un único archivo reproducible en cualquier pantalla"}
                      </span>
                    </span>
                    {busy && busyMode === "video" ? <Loader2 className="spin" style={{ width: 16, height: 16, color: "var(--cyan)" }} /> : <Download style={{ width: 16, height: 16, color: "var(--cyan)" }} />}
                  </button>
                  {scope === "movie" && movie && (
                    <>
                      <button
                        data-nav
                        onClick={downloadForTv}
                        disabled={busy}
                        className="row"
                        style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "var(--panel-2)", color: "var(--foreground)", gap: 14 }}
                      >
                        <Tv style={{ width: 20, height: 20, color: "var(--cyan)", flex: "none" }} />
                        <span className="grow">
                          <span style={{ display: "block", fontWeight: 600 }}>Exportar para USB / TV (MP4 + .srt)</span>
                          <span className="text-muted" style={{ display: "block", fontSize: 13 }}>
                            {busyMode === "tv" && progress != null
                              ? `Renderizando… ${Math.round(progress * 100)}% (mantén esta pestaña abierta)`
                              : "Película con capítulos reales para saltar con |◀◀ ▶▶| + subtítulos .srt"}
                          </span>
                        </span>
                        {busy && busyMode === "tv" ? <Loader2 className="spin" style={{ width: 16, height: 16, color: "var(--cyan)" }} /> : <Download style={{ width: 16, height: 16, color: "var(--cyan)" }} />}
                      </button>
                      <button
                        data-nav
                        onClick={downloadHtml}
                        disabled={busy}
                        className="row"
                        style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "var(--panel-2)", color: "var(--foreground)", gap: 14 }}
                      >
                        <FileCode2 style={{ width: 20, height: 20, color: "var(--gold)", flex: "none" }} />
                        <span className="grow">
                          <span style={{ display: "block", fontWeight: 600 }}>Reproductor autónomo (.html)</span>
                          <span className="text-muted" style={{ display: "block", fontSize: 13 }}>
                            {busyMode === "html" && progress != null
                              ? `Empaquetando… ${Math.round(progress * 100)}%`
                              : "Un solo archivo con menú DVD y escenas; doble clic en cualquier navegador"}
                          </span>
                        </span>
                        {busy && busyMode === "html" ? <Loader2 className="spin" style={{ width: 16, height: 16, color: "var(--cyan)" }} /> : <Download style={{ width: 16, height: 16, color: "var(--cyan)" }} />}
                      </button>
                    </>
                  )}
                  {progress != null && (
                    <div className="progress" aria-label="Progreso de generación">
                      <div style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  )}
                  <button
                    data-nav
                    onClick={downloadZip}
                    disabled={busy}
                    className="row"
                    style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--panel-2)", color: "var(--foreground)", gap: 14 }}
                  >
                    <FileArchive style={{ width: 20, height: 20, color: "var(--gold)", flex: "none" }} />
                    <span className="grow">
                      <span style={{ display: "block", fontWeight: 600 }}>Descargar paquete ZIP</span>
                      <span className="text-muted" style={{ display: "block", fontSize: 13 }}>
                        Archivos originales (MP4, JPG, MP3…) + biblioteca.json para importar en otro dispositivo
                      </span>
                    </span>
                    {busy && busyMode === "zip" ? <Loader2 className="spin" style={{ width: 16, height: 16, color: "var(--cyan)" }} /> : <Download style={{ width: 16, height: 16, color: "var(--cyan)" }} />}
                  </button>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <p className="kicker" style={{ marginBottom: 10 }}>
                Otro dispositivo
              </p>
              <div className="qr-box">{qr && <img src={qr} alt="Código QR del enlace" />}</div>
              <p style={{ fontSize: 13, marginTop: 10 }}>Abrir en este dispositivo</p>
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 10, borderTop: "1px solid var(--border)", padding: "14px 22px", fontSize: 13, background: "rgba(5,7,13,.4)" }}>
          <Star style={{ width: 16, height: 16, color: "var(--cyan)", flex: "none" }} />
          <p style={{ margin: 0 }}>
            Los vídeos se descargan como archivos estándar que se reproducen en TV, móvil y ordenador. El ZIP sirve para llevar la biblioteca a otro
            navegador. <span className="text-cyan">Sin servidores ni créditos.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- mando de TV virtual ---------- */
export function Remote({ tv, onToggleTv }) {
  const target = useRef(null);
  const move = (dir) => {
    target.current?.focus();
    const next = moveFocus(dir);
    target.current = next || document.activeElement;
  };
  return (
    <section className="panel remote-panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 className="font-display text-gold" style={{ fontSize: 18, margin: 0, fontVariant: "small-caps" }}>
          Mando TV
        </h2>
        <span className="text-cyan" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".15em" }}>
          {tv ? "PANTALLA TV" : "10-FOOT UI"}
        </span>
      </div>
      <div className="remote-dpad" role="group" aria-label="Cruceta del mando">
        <span />
        <button type="button" aria-label="Arriba" className="remote-key" onClick={() => move("up")}>
          <ArrowUp />
        </button>
        <span />
        <button type="button" aria-label="Izquierda" className="remote-key" onClick={() => move("left")}>
          <ArrowLeft />
        </button>
        <button type="button" className="remote-key ok" onClick={() => target.current?.click()}>
          OK
        </button>
        <button type="button" aria-label="Derecha" className="remote-key" onClick={() => move("right")}>
          <ArrowRight />
        </button>
        <span />
        <button type="button" aria-label="Abajo" className="remote-key" onClick={() => move("down")}>
          <ArrowDown />
        </button>
        <span />
      </div>
      <Control data-nav onClick={onToggleTv} className="btn-gold" style={{ width: "100%", padding: "12px" }}>
        <Tv /> {tv ? "Salir del modo TV" : "Activar Modo TV"}
      </Control>
    </section>
  );
}

/* ---------- galería & fotos del disco ---------- */
export function GalleryOverlay({ movie, open, onClose, navigate }) {
  const slides = (useSlideshows() ?? []).filter((s) => movie?.linkedSlideshows?.includes(s.id));
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || !movie) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-label="Galería y Fotos" onClick={(e) => e.stopPropagation()} style={{ padding: 24, width: "min(780px, 100%)" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <p className="kicker text-cyan" style={{ margin: 0 }}>
              Extras del disco
            </p>
            <h2 className="font-display text-gold" style={{ margin: "4px 0 0", fontSize: 22 }}>
              Galería & Fotos
            </h2>
          </div>
          <Control data-nav autoFocus onClick={onClose} aria-label="Cerrar" className="btn-icon">
            <X />
          </Control>
        </div>
        {slides.length === 0 && (movie.photos || []).length === 0 && (
          <p className="text-muted" style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: 20, textAlign: "center" }}>
            Este disco aún no tiene fotos ni pases vinculados. Puedes crear uno abajo o vincularlo en el editor.
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {slides.map((s) => (
            <button
              key={s.id}
              data-nav
              className="chapter-card"
              onClick={() => {
                onClose();
                navigate(`#/pase/${s.id}`);
              }}
            >
              <Thumb src={s.photos[0]} alt="" />
              <div className="meta row" style={{ justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>{s.title}</span>
                <span className="text-cyan" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Play style={{ width: 12, height: 12 }} /> {s.photos.length}
                </span>
              </div>
            </button>
          ))}
          <button
            data-nav
            className="chapter-card"
            style={{ display: "grid", placeItems: "center", minHeight: 140, borderStyle: "dashed", color: "var(--gold)" }}
            onClick={() => {
              onClose();
              navigate("#/pases/nuevo");
            }}
          >
            <span className="row" style={{ fontSize: 14, fontWeight: 600 }}>
              <Plus /> Crear pase de fotos
            </span>
          </button>
        </div>
        {(movie.photos || []).length > 0 && (
          <>
            <p className="kicker" style={{ margin: "20px 0 10px" }}>
              Fotos de la grabación ({movie.photos.length})
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {movie.photos.map((p, i) => (
                <Thumb key={i} src={p} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} alt={`Foto ${i + 1}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- avisos (toast) ---------- */
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const off = onToast((t) => {
      if (t.remove) setItems((xs) => xs.filter((x) => x.id !== t.id));
      else setItems((xs) => [...xs, t]);
    });
    return off;
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export { Clapperboard };
