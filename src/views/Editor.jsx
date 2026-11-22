import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Mic, Pause, Play, Plus, Save, Scissors, Square, Trash2, Upload } from "lucide-react";
import { Control, RemasterPanel, RemasterView, Thumb } from "../components.jsx";
import { useMovie, useSrc, fmtTime, toast, videoPoster } from "../lib/media.js";
import { putMedia, saveMovie, uid } from "../lib/db.js";
import { orderedChapters, validCut } from "../lib/types.js";
import { buildLibraryZip, downloadBlob, downloadMovieFile, renderMovieVideo, slug } from "../lib/exporter.js";

/** Editor de vídeo y capítulos: escenas, cortes, voz en off y remaster. */
export function Editor({ movieId, navigate, onShare }) {
  const stored = useMovie(movieId);
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(0);
  const [time, setTime] = useState(0);
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [cut, setCut] = useState(false);
  const [cutStart, setCutStart] = useState(0);
  const [cutEnd, setCutEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recording, setRecording] = useState(null); // MediaRecorder de voz en off
  const video = useRef(null);
  const clipInput = useRef(null);
  const voiceInput = useRef(null);
  const replaceTarget = useRef(null);
  const voiceAudio = useRef(null);

  useEffect(() => {
    if (stored && !draft) {
      setDraft(stored);
      setCutEnd(stored.duration);
    }
  }, [stored, draft]);

  const current = draft?.chapters[selected];
  const hasVideo = !!(current?.clip || draft?.video);
  const src = useSrc(current?.clip ?? draft?.video ?? current?.poster ?? draft?.cover);
  const previewDuration = current?.clip ? current.clipDuration ?? draft?.duration ?? 0 : draft?.duration ?? 0;

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    video.current?.pause();
  }, [src, selected]);

  if (!draft) return <main className="page"><p className="text-muted">Cargando editor…</p></main>;

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const updateChapter = (id, patch) =>
    setDraft((d) => ({ ...d, chapters: d.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const save = async () => {
    await saveMovie({ ...draft, chapters: orderedChapters(draft.chapters) });
    toast("Proyecto guardado en este dispositivo");
  };

  const addChapter = async () => {
    let poster = draft.cover;
    if (hasVideo && src) {
      try {
        const p = await videoPoster(src, time);
        poster = { mediaId: await putMedia(p.blob) };
      } catch {
        /* conserva la portada */
      }
    }
    const chapters = orderedChapters([
      ...draft.chapters,
      { id: uid(), title: `Escena ${String(draft.chapters.length + 1).padStart(2, "0")}`, start: time, poster },
    ]);
    update({ chapters });
    setSelected(chapters.findIndex((c) => c.start === time));
  };

  /** Guarda un clip de escena (bytes originales) y lo añade o sustituye. */
  const storeSceneClip = async (file) => {
    if (!file.type.startsWith("video/")) throw new Error("Elige un archivo de vídeo");
    const url = URL.createObjectURL(file);
    try {
      const { blob, duration } = await videoPoster(url, 0.1);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("No se pudo leer la duración del clip");
      const mediaId = await putMedia(file, file.name);
      const posterId = await putMedia(blob, `${file.name}.jpg`);
      return { id: uid(), title: file.name.replace(/\.[^.]+$/, ""), start: 0, poster: { mediaId: posterId }, clip: { mediaId }, clipDuration: duration };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const uploadClips = async (files) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const clips = [];
      for (const f of files) clips.push(await storeSceneClip(f));
      let chapters = draft.chapters;
      if (replaceTarget.current && clips[0]) {
        chapters = chapters.map((c) => (c.id === replaceTarget.current ? { ...c, ...clips[0], id: c.id, title: c.title } : c));
      } else {
        chapters = [...chapters, ...clips];
      }
      const updated = { ...draft, chapters: orderedChapters(chapters) };
      await saveMovie(updated);
      setDraft(updated);
      toast(`${clips.length} clip(s) guardado(s) en esta película`);
    } catch (e) {
      toast(e.message || "No se pudieron guardar los clips", "error");
    } finally {
      setUploading(false);
      replaceTarget.current = null;
    }
  };

  const exportMovie = async () => {
    setExporting(true);
    try {
      await saveMovie({ ...draft, chapters: orderedChapters(draft.chapters) });
      const bundle = await buildBundle({ type: "movie", id: draft.id });
      downloadBlob(bundle.blob, bundle.filename);
      toast("Película y vídeos incluidos en un único .dvd");
    } catch (e) {
      toast(e.message || "No se pudo exportar el disco", "error");
    } finally {
      setExporting(false);
    }
  };

  /** Exporta un corte del vídeo principal como película nueva (captureStream). */
  const exportCut = async () => {
    if (!video.current || !validCut(cutStart, cutEnd, draft.duration)) {
      toast("Elige un intervalo válido dentro del vídeo", "error");
      return;
    }
    const el = video.current;
    if (!el.captureStream) {
      toast("Este navegador no admite exportar cortes. Prueba Chrome en ordenador.", "error");
      return;
    }
    setBusy(true);
    el.currentTime = cutStart;
    await new Promise((r) => el.addEventListener("seeked", r, { once: true }));
    const stream = el.captureStream();
    const chunks = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType });
      const id = await putMedia(blob, "corte.webm");
      const url = URL.createObjectURL(blob);
      try {
        const poster = await videoPoster(url);
        await saveMovie({
          ...draft,
          id: `m-${uid()}`,
          title: `${draft.title} · Corte`,
          video: { mediaId: id },
          cover: { mediaId: await putMedia(poster.blob) },
          duration: cutEnd - cutStart,
          chapters: [{ id: uid(), title: "Escena 01", start: 0, poster: draft.cover }],
          createdAt: Date.now(),
        });
        toast("Corte guardado como nueva película");
      } catch {
        toast("No se pudo guardar el corte", "error");
      }
      URL.revokeObjectURL(url);
      setBusy(false);
      setCut(false);
    };
    rec.start();
    await el.play();
    const stop = () => {
      if (el.currentTime >= cutEnd) {
        el.removeEventListener("timeupdate", stop);
        el.pause();
        if (rec.state !== "inactive") rec.stop();
      }
    };
    el.addEventListener("timeupdate", stop);
  };

  /* --- voz en off del capítulo seleccionado --- */
  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const mediaId = await putMedia(blob, "voz-en-off.webm");
        updateChapter(current.id, { voiceOver: { mediaId } });
        toast("Voz en off guardada para este capítulo");
      };
      rec.start();
      setRecording(rec);
    } catch {
      toast("No se pudo acceder al micrófono", "error");
    }
  };

  const uploadVoice = async (file) => {
    if (!file || !current) return;
    const mediaId = await putMedia(file, file.name);
    updateChapter(current.id, { voiceOver: { mediaId } });
    toast("Voz en off añadida a este capítulo");
  };

  const seek = (t) => {
    setTime(t);
    if (video.current) video.current.currentTime = current?.clip ? t : t;
  };

  return (
    <main className="editor-layout">
      <aside>
        <Control data-nav onClick={() => navigate("#/")} style={{ marginBottom: 14 }}>
          <ArrowLeft /> Menú DVD
        </Control>
        <RemasterPanel
          value={draft.remaster}
          onChange={(r) => update({ remaster: r })}
          onApply={async () => {
            const updated = { ...draft, remasterOn: true };
            setDraft(updated);
            await saveMovie(updated);
            toast("Remasterización aplicada, sin créditos");
          }}
          applyLabel="Aplicar"
          badge="LOCAL"
        />
        <div className="panel" style={{ padding: 16, marginTop: 16 }}>
          <h3 className="font-display text-gold" style={{ margin: "0 0 10px", fontSize: 16, fontVariant: "small-caps" }}>
            Voz en off del capítulo
          </h3>
          <p className="text-muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
            {current?.title ?? "—"}
          </p>
          {current?.voiceOver ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Control
                data-nav
                className="btn-outline-gold"
                onClick={async () => {
                  const { resolveSrc } = await import("../lib/media.js");
                  const u = await resolveSrc(current.voiceOver);
                  if (u) {
                    voiceAudio.current.src = u;
                    voiceAudio.current.play().catch(() => {});
                  }
                }}
              >
                <Play /> Escuchar voz en off
              </Control>
              <Control data-nav className="btn-danger" onClick={() => updateChapter(current.id, { voiceOver: undefined })}>
                <Trash2 /> Quitar voz en off
              </Control>
            </div>
          ) : recording ? (
            <Control data-nav className="btn-danger" onClick={() => recording.stop()} style={{ width: "100%" }}>
              <Square /> Detener grabación
            </Control>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Control data-nav className="btn-gold" onClick={startVoice} disabled={!current}>
                <Mic /> Grabar voz en off
              </Control>
              <Control data-nav onClick={() => voiceInput.current?.click()} disabled={!current}>
                <Upload /> Subir audio
              </Control>
            </div>
          )}
          <audio ref={voiceAudio} className="hidden-file" />
          <input
            ref={voiceInput}
            type="file"
            accept="audio/*"
            className="hidden-file"
            aria-label="Subir voz en off"
            onChange={(e) => {
              uploadVoice(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </aside>

      <section style={{ minWidth: 0 }}>
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid var(--gold-soft)" }}>
          <RemasterView
            ref={video}
            kind={hasVideo ? "video" : "image"}
            src={src}
            settings={draft.remaster}
            enabled
            split={split}
            className=""
            style={{ aspectRatio: "16/9" }}
            onTime={(t) => setTime(t)}
          />
          <span style={{ position: "absolute", left: 12, top: 12, background: "rgba(5,7,13,.7)", borderRadius: 8, padding: "4px 10px", fontSize: 11 }}>
            ORIGINAL
          </span>
          <span className="text-cyan" style={{ position: "absolute", right: 12, top: 12, background: "rgba(5,7,13,.7)", borderRadius: 8, padding: "4px 10px", fontSize: 11 }}>
            REMASTERIZADO · 0 CRÉDITOS
          </span>
          <input
            aria-label="Comparar original y remasterizado"
            type="range"
            min="0"
            max="100"
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            className="compare-slider"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />
        </div>

        <div className="panel" style={{ padding: 16, marginTop: 16 }}>
          <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
            <Control
              data-nav
              className="btn-icon text-cyan"
              aria-label={playing ? "Pausar" : "Reproducir"}
              onClick={() => {
                if (video.current) {
                  if (playing) video.current.pause();
                  else video.current.play().catch(() => {});
                }
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause /> : <Play />}
            </Control>
            <span className="mono text-cyan" style={{ fontSize: 13 }}>
              {fmtTime(time)} <span className="text-muted">/ {fmtTime(previewDuration)}</span>
            </span>
            <span className="grow" />
            <Control data-nav className="btn-outline-gold" disabled={!draft.video || !!current?.clip} onClick={() => { setCutStart(time); setCutEnd(draft.duration); setCut(true); }}>
              <Scissors /> Cortar
            </Control>
            <Control data-nav className="btn-outline-cyan" onClick={addChapter}>
              <Plus /> Capítulo
            </Control>
          </div>
          <input
            aria-label="Posición del editor"
            data-nav
            type="range"
            className="dvd-range"
            style={{ "--p": `${previewDuration ? (time / previewDuration) * 100 : 0}%` }}
            min="0"
            max={previewDuration}
            step="0.1"
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <div className="timeline" style={{ marginTop: 12 }}>
            {draft.chapters.map((c, i) => (
              <button key={c.id} data-nav data-on={i === selected} onClick={() => { setSelected(i); seek(c.clip ? 0 : c.start); }} title={c.title}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {cut && (
          <div className="panel" style={{ padding: 16, marginTop: 16 }}>
            <h3 className="font-display text-gold" style={{ margin: "0 0 12px", fontSize: 16, fontVariant: "small-caps" }}>
              Exportar corte
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ fontSize: 13 }}>
                Inicio (s)
                <input type="number" className="field" value={cutStart} min="0" onChange={(e) => setCutStart(Number(e.target.value))} />
              </label>
              <label style={{ fontSize: 13 }}>
                Fin (s)
                <input type="number" className="field" value={cutEnd} min="0" onChange={(e) => setCutEnd(Number(e.target.value))} />
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Control data-nav className="btn-gold" onClick={exportCut} disabled={busy}>
                {busy ? "Exportando…" : "Exportar corte como película nueva"}
              </Control>
              <Control data-nav onClick={() => setCut(false)}>
                Cancelar
              </Control>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <label style={{ fontSize: 13 }}>
            Título de la película
            <input className="field" style={{ marginTop: 6 }} value={draft.title} onChange={(e) => update({ title: e.target.value })} />
          </label>
          <label style={{ fontSize: 13 }}>
            Subtítulo
            <input className="field" style={{ marginTop: 6 }} value={draft.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
          </label>
        </div>
        <div className="row wrap" style={{ marginTop: 16, gap: 8 }}>
          <Control data-nav className="btn-gold" onClick={save}>
            <Save /> Guardar proyecto
          </Control>
          <Control data-nav className="btn-outline-gold" disabled={exporting || uploading} onClick={downloadVideo}>
            <Download /> {exporting ? "Generando…" : "Descargar vídeo (MP4/WebM)"}
          </Control>
          <Control data-nav disabled={exporting || uploading} onClick={downloadZip}>
            <Download /> Paquete ZIP
          </Control>
          <Control data-nav onClick={() => onShare(draft.id)}>
            Compartir
          </Control>
        </div>
      </section>

      <aside>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="kicker">Capítulos</h2>
          <Control
            data-nav
            className="btn-outline-cyan"
            disabled={uploading}
            onClick={() => {
              replaceTarget.current = null;
              if (clipInput.current) {
                clipInput.current.multiple = true;
                clipInput.current.click();
              }
            }}
          >
            <Upload /> {uploading ? "Guardando…" : "Subir clips"}
          </Control>
        </div>
        <input
          ref={clipInput}
          aria-label="Clips de escenas"
          type="file"
          accept="video/*"
          multiple
          className="hidden-file"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void uploadClips(files);
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {draft.chapters.map((c, i) => (
            <div key={c.id} className="panel" style={{ padding: 10, borderColor: i === selected ? "var(--cyan)" : undefined }}>
              <div className="row" style={{ gap: 10 }}>
                <button data-nav onClick={() => { setSelected(i); seek(c.clip ? 0 : c.start); }} style={{ padding: 0, border: 0, background: "none", flex: "none" }} aria-label={`Ver capítulo ${c.title}`}>
                  <Thumb src={c.poster} style={{ width: 96, aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, display: "block" }} alt="" />
                </button>
                <div className="grow" style={{ minWidth: 0 }}>
                  <input
                    aria-label={`Título del capítulo ${i + 1}`}
                    className="field"
                    style={{ padding: "6px 8px", fontSize: 13 }}
                    value={c.title}
                    onChange={(e) => updateChapter(c.id, { title: e.target.value })}
                  />
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    {!c.clip && (
                      <input
                        aria-label={`Inicio del capítulo ${i + 1} (segundos)`}
                        type="number"
                        className="field"
                        style={{ padding: "4px 8px", fontSize: 12, width: 86 }}
                        value={c.start}
                        min="0"
                        step="0.1"
                        onChange={(e) => updateChapter(c.id, { start: Number(e.target.value) })}
                      />
                    )}
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {c.clip ? `clip ${fmtTime(c.clipDuration ?? 0, false)}` : `desde ${fmtTime(c.start, false)}`}
                      {c.voiceOver ? " · 🎙" : ""}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {c.clip && (
                    <Control
                      data-nav
                      className="btn-icon"
                      title="Sustituir clip"
                      aria-label={`Sustituir clip de ${c.title}`}
                      onClick={() => {
                        replaceTarget.current = c.id;
                        if (clipInput.current) {
                          clipInput.current.multiple = false;
                          clipInput.current.click();
                        }
                      }}
                    >
                      <Upload />
                    </Control>
                  )}
                  <Control data-nav className="btn-icon" title="Eliminar capítulo" aria-label={`Eliminar capítulo ${c.title}`} onClick={() => update({ chapters: draft.chapters.filter((x) => x.id !== c.id) })}>
                    <Trash2 />
                  </Control>
                </div>
              </div>
            </div>
          ))}
          {draft.chapters.length === 0 && <p className="text-muted">Sin capítulos. Añade uno con el botón «Capítulo» o sube clips de escenas.</p>}
        </div>
      </aside>
    </main>
  );
}
