import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Images, Music, Pause, Pencil, Play, Plus, Save, Share2, Trash2, Upload } from "lucide-react";
import { Control, Thumb } from "../components.jsx";
import { useSlideshow, useSrc, fmtTime, toast } from "../lib/media.js";
import { putMedia, saveSlideshow } from "../lib/db.js";
import { FREE_TRACKS, TRANSITIONS, newSlideshow } from "../lib/types.js";
import { startFreeMusic } from "../lib/music.js";

/* ================= Creador / editor de pases de fotos ================= */
export function SlideshowCreator({ slideshowId, navigate, onShare }) {
  const existing = useSlideshow(slideshowId);
  const [draft, setDraft] = useState(() => newSlideshow());
  const [loadedId, setLoadedId] = useState(null);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef(null);
  const musicInput = useRef(null);
  const currentUrl = useSrc(draft.photos[current]);

  useEffect(() => {
    if (slideshowId && existing && loadedId !== existing.id) {
      setDraft(existing);
      setLoadedId(existing.id);
      setCurrent(0);
    } else if (!slideshowId && loadedId !== null) {
      setDraft(newSlideshow());
      setLoadedId(null);
      setCurrent(0);
    }
  }, [slideshowId, existing, loadedId]);

  const addPhotos = async (files) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setBusy(true);
    try {
      const photos = [...draft.photos];
      for (const f of imgs) photos.push({ mediaId: await putMedia(f, f.name) });
      setDraft((d) => ({ ...d, photos }));
      toast(`${imgs.length} foto(s) añadida(s)`);
    } catch {
      toast("No se pudieron guardar las fotos", "error");
    } finally {
      setBusy(false);
    }
  };

  const move = (i, dir) => {
    const photos = [...draft.photos];
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    [photos[i], photos[j]] = [photos[j], photos[i]];
    setDraft((d) => ({ ...d, photos }));
    setCurrent(j);
  };

  const save = async () => {
    if (!draft.photos.length) return toast("Añade al menos una foto", "error");
    await saveSlideshow(draft);
    toast("Pase guardado en tu biblioteca");
    navigate(`#/pase/${draft.id}`);
  };

  return (
    <main className="slideshow-layout">
      <aside>
        <Control data-nav onClick={() => navigate("#/biblioteca")} style={{ marginBottom: 14 }}>
          <ArrowLeft /> Biblioteca
        </Control>
        <section className="panel" style={{ padding: 18 }}>
          <h2 className="font-display text-gold" style={{ margin: "0 0 14px", fontSize: 18, fontVariant: "small-caps" }}>
            Ajustes del pase
          </h2>
          <label style={{ fontSize: 13, display: "block", marginBottom: 14 }}>
            Título
            <input className="field" style={{ marginTop: 6 }} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </label>
          <label style={{ fontSize: 13, display: "block", marginBottom: 14 }}>
            Segundos por foto: <span className="mono text-cyan">{draft.seconds}s</span>
            <input
              data-nav
              type="range"
              className="dvd-range"
              style={{ "--p": `${((draft.seconds - 2) / 8) * 100}%`, marginTop: 8 }}
              min="2"
              max="10"
              value={draft.seconds}
              onChange={(e) => setDraft((d) => ({ ...d, seconds: Number(e.target.value) }))}
            />
          </label>
          <label style={{ fontSize: 13, display: "block", marginBottom: 14 }}>
            Transición
            <select className="field" style={{ marginTop: 6 }} value={draft.transition} onChange={(e) => setDraft((d) => ({ ...d, transition: e.target.value }))}>
              {TRANSITIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 13 }}>
            <span className="row" style={{ marginBottom: 8 }}>
              <Music style={{ width: 15, height: 15, color: "var(--cyan)" }} /> Música
            </span>
            <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
              <button data-nav className="chip" data-on={draft.music.kind === "free"} onClick={() => setDraft((d) => ({ ...d, music: { kind: "free", trackId: d.music.trackId || "amanecer" } }))}>
                Libre de derechos
              </button>
              <button data-nav className="chip" data-on={draft.music.kind === "own"} onClick={() => musicInput.current?.click()}>
                Mi música
              </button>
              <button data-nav className="chip" data-on={draft.music.kind === "none"} onClick={() => setDraft((d) => ({ ...d, music: { kind: "none" } }))}>
                Sin música
              </button>
            </div>
            {draft.music.kind === "free" && (
              <select className="field" value={draft.music.trackId} onChange={(e) => setDraft((d) => ({ ...d, music: { kind: "free", trackId: e.target.value } }))}>
                {FREE_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.mood}
                  </option>
                ))}
              </select>
            )}
            {draft.music.kind === "own" && (
              <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                {draft.music.name ? `🎵 ${draft.music.name}` : "Pulsa «Mi música» para elegir un archivo de audio de tu dispositivo."}
              </p>
            )}
            <input
              ref={musicInput}
              type="file"
              accept="audio/*"
              className="hidden-file"
              aria-label="Subir música propia"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const mediaId = await putMedia(f, f.name);
                setDraft((d) => ({ ...d, music: { kind: "own", mediaId, name: f.name } }));
                toast("Música añadida al pase");
              }}
            />
          </div>
          <Control data-nav className="btn-gold" onClick={save} style={{ width: "100%", marginTop: 18, padding: "12px" }}>
            <Save /> Guardar pase
          </Control>
        </section>
      </aside>

      <section style={{ minWidth: 0 }}>
        <div className="slide-stage">
          {currentUrl ? (
            <img key={current} src={currentUrl} alt="" className="kenburns" />
          ) : (
            <div className="empty" style={{ padding: 60 }}>
              <Images style={{ width: 40, height: 40, color: "var(--gold)" }} />
              <p>Añade fotos para crear tu pase</p>
            </div>
          )}
        </div>
        <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
          <Control data-nav className="btn-gold" onClick={() => photoInput.current?.click()} disabled={busy}>
            <Upload /> {busy ? "Guardando…" : "Añadir fotos"}
          </Control>
          <Control data-nav onClick={() => move(current, -1)} disabled={current === 0}>
            <ChevronLeft /> Anterior
          </Control>
          <Control data-nav onClick={() => move(current, 1)} disabled={current >= draft.photos.length - 1}>
            Siguiente <ChevronRight />
          </Control>
          <Control data-nav className="btn-danger" onClick={() => { setDraft((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== current) })); setCurrent(0); }} disabled={!draft.photos.length}>
            <Trash2 /> Quitar foto
          </Control>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {draft.photos.length ? `${current + 1} / ${draft.photos.length}` : "Sin fotos"}
          </span>
        </div>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden-file"
          aria-label="Añadir fotos"
          onChange={(e) => {
            addPhotos(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div className="photo-strip" style={{ marginTop: 10 }}>
          {draft.photos.map((p, i) => (
            <Thumb key={`${p.mediaId || p.url || "foto"}-${i}`} src={p} data-on={i === current} onClick={() => setCurrent(i)} alt={`Foto ${i + 1}`} />
          ))}
        </div>
      </section>
    </main>
  );
}

/* ================= Reproductor de pases ================= */
export function SlideshowPlayer({ slideshowId, navigate, onShare }) {
  const show = useSlideshow(slideshowId);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const musicRef = useRef(null);
  const audioRef = useRef(null);
  const currentUrl = useSrc(show?.photos[idx]);

  /* Música del pase */
  useEffect(() => {
    if (!show) return;
    let handle = null;
    if (playing && show.music.kind === "free") {
      handle = startFreeMusic(show.music.trackId, { volume: 0.6 });
      musicRef.current = handle;
    }
    return () => {
      handle?.stop();
      musicRef.current = null;
    };
  }, [show?.id, show?.music.kind, show?.music.trackId, playing]);

  const ownUrl = useSrc(show?.music.kind === "own" ? { mediaId: show.music.mediaId } : undefined);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing && ownUrl) {
      a.src = ownUrl;
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [ownUrl, playing]);

  /* Avance automático */
  useEffect(() => {
    if (!playing || !show?.photos.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % show.photos.length), show.seconds * 1000);
    return () => clearInterval(t);
  }, [playing, show?.id, show?.seconds, show?.photos.length]);

  if (!show) return <main className="page"><p className="text-muted">Cargando pase…</p></main>;

  const transClass = show.transition === "wipe" ? "wipe-in" : show.transition === "iris" ? "iris-in" : "fade-in";

  return (
    <main className="player-wrap">
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <Control data-nav onClick={() => navigate("#/biblioteca")}>
          <ArrowLeft /> Biblioteca
        </Control>
        <span className="grow" />
        <Control data-nav className="btn-outline-gold" onClick={() => navigate(`#/pases/editar/${show.id}`)}>
          <Pencil /> Editar pase
        </Control>
        <Control data-nav className="btn-outline-cyan" onClick={() => navigate("#/pases/nuevo")}>
          <Plus /> Nuevo pase
        </Control>
        <Control data-nav onClick={() => onShare(null, show.id)}>
          <Share2 /> Compartir
        </Control>
      </div>

      <div className="slide-stage">
        {currentUrl && <img key={idx} src={currentUrl} alt="" className={`kenburns ${transClass}`} />}
        <span style={{ position: "absolute", left: 12, top: 12, background: "rgba(5,7,13,.7)", borderRadius: 8, padding: "4px 10px", fontSize: 12 }}>
          {idx + 1} / {show.photos.length} · {show.title}
        </span>
      </div>

      <div className="player-controls">
        <Control data-nav className="btn-icon" aria-label="Foto anterior" onClick={() => setIdx((i) => (i - 1 + show.photos.length) % show.photos.length)}>
          <ChevronLeft />
        </Control>
        <Control data-nav className="btn-gold btn-icon" style={{ width: 52, height: 52 }} aria-label={playing ? "Pausar" : "Reproducir"} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause /> : <Play />}
        </Control>
        <Control data-nav className="btn-icon" aria-label="Foto siguiente" onClick={() => setIdx((i) => (i + 1) % show.photos.length)}>
          <ChevronRight />
        </Control>
        <span className="mono text-cyan" style={{ fontSize: 13 }}>
          {fmtTime(show.photos.length * show.seconds, false)} total
        </span>
        <span className="grow" />
        <span className="text-muted" style={{ fontSize: 13 }}>
          {show.music.kind === "free" ? `🎵 ${FREE_TRACKS.find((t) => t.id === show.music.trackId)?.name ?? "Libre de derechos"}` : show.music.kind === "own" ? `🎵 ${show.music.name}` : "Sin música"}
        </span>
      </div>
      <audio ref={audioRef} loop className="hidden-file" />
    </main>
  );
}
