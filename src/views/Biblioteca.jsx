import { useMemo, useRef, useState } from "react";
import { Download, Film, Images, Mic, Pencil, Play, Plus, Search, Share2, Trash2, Upload } from "lucide-react";
import { Control } from "../components.jsx";
import { useSrc, fmtTime, toast, videoPoster } from "../lib/media.js";
import { deleteMovie, deleteSlideshow, putMedia, saveMovie, storageUsage, uid } from "../lib/db.js";
import { importBundle } from "../lib/bundle.js";
import { importLibraryZip } from "../lib/exporter.js";
import { newMovie } from "../lib/types.js";

/** Biblioteca: todas las películas y pases guardados en el dispositivo. */
export function Biblioteca({ movies, slideshows, navigate, onShare, onOpenMovie }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(null);
  const [remove, setRemove] = useState(null);
  const videoInput = useRef(null);
  const importInput = useRef(null);

  useMemo(() => {
    storageUsage().then(setUsage);
  }, [movies, slideshows]);

  const items = useMemo(
    () =>
      [...movies, ...slideshows].filter(
        (i) => (tab === "all" || i.kind === tab) && i.title.toLowerCase().includes(query.toLowerCase())
      ),
    [movies, slideshows, tab, query]
  );

  const uploadVideo = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) return toast("Elige un archivo de vídeo", "error");
    setBusy(true);
    try {
      const url = URL.createObjectURL(file);
      const { blob: posterBlob, duration } = await videoPoster(url, 0.5);
      URL.revokeObjectURL(url);
      const movie = newMovie(file.name.replace(/\.[^.]+$/, "") || "Mi película");
      movie.video = { mediaId: await putMedia(file, file.name) };
      movie.cover = { mediaId: await putMedia(posterBlob, "portada.jpg") };
      movie.duration = duration;
      movie.chapters = [{ id: uid(), title: "Escena 01", start: 0, poster: movie.cover }];
      await saveMovie(movie);
      toast("Película guardada en tu biblioteca");
      onOpenMovie(movie.id);
    } catch (e) {
      toast(e.message || "No se pudo guardar el vídeo", "error");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file) => {
    if (!file) return;
    try {
      const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
      const r = isZip ? await importLibraryZip(file) : await importBundle(file);
      toast(`Importado: ${r.movies} películas y ${r.slideshows} pases`);
    } catch (e) {
      toast(e.message || "No se pudo importar", "error");
    }
  };

  const confirmRemove = async () => {
    if (!remove) return;
    if (remove.kind === "movie") await deleteMovie(remove.id);
    else await deleteSlideshow(remove.id);
    toast(`"${remove.title}" eliminado de este dispositivo`);
    setRemove(null);
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="kicker text-cyan">En este dispositivo</p>
          <h1>Mi Discoteca</h1>
          <p className="text-muted" style={{ margin: 0 }}>
            {movies.length} películas · {slideshows.length} pases de fotos
            {usage != null && <> · {(usage / 1048576).toFixed(1)} MB guardados</>}
          </p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Control data-nav className="btn-gold" onClick={() => videoInput.current?.click()} disabled={busy}>
            <Upload /> {busy ? "Guardando…" : "Subir vídeo"}
          </Control>
          <Control data-nav className="btn-outline-cyan" onClick={() => navigate("#/pases/nuevo")}>
            <Plus /> Pase de fotos
          </Control>
          <Control data-nav onClick={() => navigate("#/estudio")}>
            <Mic /> Grabar
          </Control>
          <Control data-nav onClick={() => importInput.current?.click()}>
            <Download /> Importar ZIP
          </Control>
          <Control data-nav className="btn-outline-gold" onClick={() => onShare(null, null, "all")}>
            <Share2 /> Compartir
          </Control>
        </div>
      </div>

      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        className="hidden-file"
        aria-label="Subir vídeo"
        onChange={(e) => {
          uploadVideo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept=".zip,.dvd,application/zip,application/json"
        className="hidden-file"
        aria-label="Importar biblioteca (ZIP)"
        onChange={(e) => {
          doImport(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="row wrap" style={{ justifyContent: "space-between", marginBottom: 22, gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          {[
            ["all", "Todo"],
            ["movie", "Películas"],
            ["slideshow", "Pases de fotos"],
          ].map(([id, label]) => (
            <button key={id} data-nav className="chip" data-on={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="row" style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "0 14px", background: "var(--panel)" }}>
          <Search style={{ width: 16, height: 16, color: "var(--muted)" }} />
          <input
            aria-label="Buscar en biblioteca"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la biblioteca"
            style={{ height: 40, background: "transparent", border: 0, outline: "none", width: 200 }}
          />
        </label>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="big">No hay discos que mostrar</div>
          <p>Sube un vídeo o crea tu primer pase de fotos para empezar.</p>
        </div>
      ) : (
        <div className="lib-grid">
          {items.map((item) => (
            <LibCard key={item.id} item={item} navigate={navigate} onOpenMovie={onOpenMovie} onRemove={() => setRemove(item)} />
          ))}
        </div>
      )}

      {remove && (
        <div className="modal-backdrop" onClick={() => setRemove(null)}>
          <div className="modal panel" role="dialog" aria-label="Eliminar disco" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 440 }}>
            <h2 className="font-display text-gold" style={{ margin: "0 0 8px", fontSize: 22 }}>
              ¿Eliminar "{remove.title}"?
            </h2>
            <p className="text-muted">Se quitará de esta biblioteca. Esta acción no se puede deshacer.</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <Control data-nav onClick={() => setRemove(null)}>
                Cancelar
              </Control>
              <Control data-nav className="btn-danger" onClick={confirmRemove}>
                Eliminar
              </Control>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LibCard({ item, navigate, onOpenMovie, onRemove }) {
  const isMovie = item.kind === "movie";
  const cover = isMovie ? item.cover : item.photos[0];
  const url = useSrc(cover);
  return (
    <article className="lib-card">
      <div className="thumb">
        {url ? <img src={url} alt="" /> : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a2238,#0d1220)" }} />}
        <span className="kind">{isMovie ? <Film style={{ width: 16, height: 16 }} /> : <Images style={{ width: 16, height: 16 }} />}</span>
      </div>
      <div className="body">
        <h2 style={{ margin: 0, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</h2>
        <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
          {isMovie ? `${item.chapters.length} capítulos · ${fmtTime(item.duration, false)}` : `${item.photos.length} fotos · ${fmtTime(item.photos.length * item.seconds, false)}`}
        </p>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <Control
            data-nav
            className="btn-outline-cyan grow"
            onClick={() => (isMovie ? onOpenMovie(item.id) : navigate(`#/pase/${item.id}`))}
          >
            <Play /> {isMovie ? "Abrir disco" : "Ver pase"}
          </Control>
          <Control
            data-nav
            className="btn-icon"
            title="Editar"
            aria-label={`Editar ${item.title}`}
            onClick={() => navigate(isMovie ? `#/editor/${item.id}` : `#/pases/editar/${item.id}`)}
          >
            <Pencil />
          </Control>
          <Control data-nav className="btn-icon" title="Eliminar" aria-label={`Eliminar ${item.title}`} onClick={onRemove}>
            <Trash2 />
          </Control>
        </div>
      </div>
    </article>
  );
}
