import { useState } from "react";
import { Clapperboard, Film, Images, Mic, Play, Scissors, Share2 } from "lucide-react";
import { Control, GalleryOverlay, RemasterPanel, Remote, Thumb } from "../components.jsx";
import { useSrc, fmtTime, toast } from "../lib/media.js";
import { saveMovie } from "../lib/db.js";

/** Portada estilo menú DVD: película actual, capítulos y remaster. */
export function Home({ movies, slideshows, currentId, onSelect, navigate, onShare, look, tv, onToggleTv }) {
  const movie = movies.find((m) => m.id === currentId) ?? movies[0];
  const [remaster, setRemaster] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const coverUrl = useSrc(movie?.cover);

  if (!movie) {
    return (
      <main className="dvd-stage">
        <div className="dvd-inner">
          <div className="empty">
            <div className="big">Tu discoteca está vacía</div>
            <p>Sube un vídeo, graba tu primera película o crea un pase de fotos. Todo se guarda en este dispositivo.</p>
            <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
              <Control data-nav className="btn-gold btn-lg" onClick={() => navigate("#/biblioteca")}>
                <Film /> Ir a la biblioteca
              </Control>
              <Control data-nav className="btn-outline-cyan btn-lg" onClick={() => navigate("#/estudio")}>
                <Mic /> Grabar
              </Control>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const draft = remaster ?? movie.remaster;
  const linked = slideshows.filter((s) => movie.linkedSlideshows.includes(s.id));

  const applyRemaster = async () => {
    await saveMovie({ ...movie, remaster: draft, remasterOn: true });
    setRemaster(null);
    toast("Remasterización aplicada, sin créditos");
  };

  return (
    <main className={`dvd-stage look-${look}`}>
      <div className="dvd-backdrop" aria-hidden>
        {coverUrl && <img src={coverUrl} alt="" />}
      </div>
      <div className="dvd-inner">
        {movies.length > 1 && (
          <div className="row wrap" style={{ gap: 8, marginBottom: 22 }}>
            {movies.map((m) => (
              <button key={m.id} data-nav className="chip" data-on={m.id === movie.id} onClick={() => onSelect(m.id)}>
                {m.title}
              </button>
            ))}
          </div>
        )}

        <div className="dvd-main-grid">
          <section className="movie-title">
            <p className="kicker text-cyan">{movie.kicker || "Presentación"}</p>
            <h1>{movie.title}</h1>
            <p className="text-muted" style={{ margin: "4px 0 0" }}>
              {movie.subtitle} · {movie.chapters.length} capítulos · {fmtTime(movie.duration, false)}
              {movie.remasterOn && <span className="text-cyan"> · Remasterizado</span>}
            </p>
            <div className="movie-actions">
              <Control data-nav className="btn-gold btn-lg" onClick={() => navigate(`#/repro/${movie.id}`)}>
                <Play /> Reproducir
              </Control>
              <Control data-nav className="btn-outline-cyan btn-lg" onClick={() => navigate(`#/editor/${movie.id}`)}>
                <Scissors /> Editor
              </Control>
              <Control data-nav className="btn-outline-gold btn-lg" onClick={() => onShare(movie.id)}>
                <Share2 /> Compartir
              </Control>
              <Control data-nav className="btn-outline-cyan btn-lg" onClick={() => setGalleryOpen(true)}>
                <Images /> Galería
              </Control>
              <Control data-nav className="btn-lg" onClick={() => navigate("#/estudio")}>
                <Mic /> Grabar
              </Control>
            </div>
          </section>
          <aside className="home-remaster">
            <RemasterPanel value={draft} onChange={setRemaster} onApply={applyRemaster} applyLabel="Aplicar al disco" />
          </aside>
        </div>

        <section className="chapters-section" style={{ marginTop: 36 }}>
          <h2 className="font-display text-gold" style={{ fontSize: 22, margin: "0 0 4px", fontVariant: "small-caps" }}>
            Capítulos
          </h2>
          {movie.chapters.length === 0 ? (
            <p className="text-muted">Esta película aún no tiene capítulos. Ábrela en el editor para añadir escenas.</p>
          ) : (
            <div className="chapter-strip">
              {movie.chapters.map((c, i) => (
                <button key={c.id} data-nav className="chapter-card" onClick={() => navigate(`#/repro/${movie.id}?cap=${i}`)}>
                  <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  <Thumb src={c.poster} alt="" />
                  <span className="meta">
                    <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {fmtTime(c.start, false)}
                      {c.voiceOver ? " · 🎙 voz en off" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {linked.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <h2 className="font-display text-gold" style={{ fontSize: 22, margin: "0 0 10px", fontVariant: "small-caps" }}>
              Pases de fotos vinculados
            </h2>
            <div className="row wrap" style={{ gap: 10 }}>
              {linked.map((s) => (
                <Control key={s.id} data-nav className="btn-outline-cyan" onClick={() => navigate(`#/pase/${s.id}`)}>
                  <Images /> {s.title}
                </Control>
              ))}
            </div>
          </section>
        )}

        <Remote tv={tv} onToggleTv={onToggleTv} />

        <GalleryOverlay movie={movie} open={galleryOpen} onClose={() => setGalleryOpen(false)} navigate={navigate} />

        <p className="text-muted" style={{ marginTop: 34, fontSize: 13 }}>
          <Clapperboard style={{ width: 14, height: 14, verticalAlign: -2 }} /> DVD Retro Studio — 100% local. Tus películas viven en este dispositivo, sin cuentas ni créditos.
        </p>
      </div>
    </main>
  );
}
