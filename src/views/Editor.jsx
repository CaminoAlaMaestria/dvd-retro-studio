import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Download, Film, ImagePlus, Images, Mic, Pause, Play, Plus, Save, Scissors, Square, Trash2, Upload } from "lucide-react";
import { Control, RemasterPanel, RemasterView, Thumb } from "../components.jsx";
import { useMovie, useSlideshows, useSrc, fmtTime, resolveSrc, toast, videoPoster } from "../lib/media.js";
import { putMedia, saveMovie, uid } from "../lib/db.js";
import { orderedChapters, validCut } from "../lib/types.js";
import { buildLibraryZip, downloadBlob, downloadMovieFile, renderMovieVideo, slug } from "../lib/exporter.js";

/** Recalcula los inicios acumulados cuando la película se compone de clips/fotos secuenciales. */
function syncSequentialStarts(chapters, movieVideo, currentDuration = 0) {
  const usesSequential = !movieVideo || chapters.some((c) => c.clip);
  if (!usesSequential) {
    return { chapters: orderedChapters(chapters), duration: currentDuration };
  }
  let acc = 0;
  const next = chapters.map((c) => {
    const out = { ...c, start: Math.round(acc * 10) / 10 };
    acc += c.clip ? c.clipDuration ?? 4 : 4;
    return out;
  });
  return { chapters: next, duration: Math.max(acc, currentDuration && !chapters.length ? currentDuration : acc) };
}

/** Editor de vídeo y capítulos: película principal, escenas, cortes, voz en off y remaster. */
export function Editor({ movieId, navigate, onShare }) {
  const stored = useMovie(movieId);
  const allSlides = useSlideshows() ?? [];
  const [draft, setDraft] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [time, setTime] = useState(0);
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [cut, setCut] = useState(false);
  const [cutStart, setCutStart] = useState(0);
  const [cutEnd, setCutEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recording, setRecording] = useState(null);

  const video = useRef(null);
  const mainVideoInput = useRef(null);
  const coverInput = useRef(null);
  const clipInput = useRef(null);
  const chapterPhotoInput = useRef(null);
  const voiceInput = useRef(null);
  const replaceTarget = useRef(null);
  const photoTarget = useRef(null);
  const voiceAudio = useRef(null);
  const pendingSeek = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    setDraft(null);
    setSelectedId(null);
    setPlaying(false);
    setTime(0);
  }, [movieId]);

  useEffect(() => {
    if (stored && !draft) {
      setDraft(stored);
      setSelectedId(stored.chapters[0]?.id ?? null);
      setCutEnd(stored.duration);
    }
  }, [stored, draft]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const persistNow = useCallback(async (nextDraft) => {
    clearTimeout(saveTimer.current);
    const chapters = !nextDraft.video || nextDraft.chapters.some((c) => c.clip)
      ? nextDraft.chapters
      : orderedChapters(nextDraft.chapters);
    const clean = { ...nextDraft, chapters };
    await saveMovie(clean);
    return clean;
  }, []);

  const schedulePersist = useCallback(
    (nextDraft) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistNow(nextDraft);
      }, 350);
    },
    [persistNow]
  );

  const selectedIndex = draft ? Math.max(0, draft.chapters.findIndex((c) => c.id === selectedId)) : 0;
  const current = draft?.chapters[selectedIndex] ?? draft?.chapters[0] ?? null;
  const hasVideo = !!(current?.clip || draft?.video);
  const src = useSrc(current?.clip ?? draft?.video ?? current?.poster ?? draft?.cover);
  const previewDuration = current?.clip ? current.clipDuration ?? draft?.duration ?? 0 : draft?.duration ?? 0;

  if (!draft) {
    return (
      <main className="page">
        <p className="text-muted">Cargando editor…</p>
      </main>
    );
  }

  const update = (patch, immediate = false) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (immediate) void persistNow(next);
      else schedulePersist(next);
      return next;
    });
  };

  const updateChapter = (id, patch, immediate = false) => {
    setDraft((prev) => {
      const nextChapters = prev.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c));
      const next = { ...prev, chapters: nextChapters };
      if (immediate) void persistNow(next);
      else schedulePersist(next);
      return next;
    });
  };

  const seekTo = (t) => {
    const target = Math.max(0, Number.isFinite(t) ? t : 0);
    setTime(target);
    pendingSeek.current = target;
    if (video.current && video.current.readyState >= 1) {
      video.current.currentTime = target;
      pendingSeek.current = null;
    }
  };

  const selectChapter = (chapter) => {
    if (!chapter) return;
    setSelectedId(chapter.id);
    setPlaying(false);
    video.current?.pause();
    const target = chapter.clip ? 0 : chapter.start ?? 0;
    const nextSrcWillChange = !!(chapter.clip || current?.clip);
    setTime(target);
    pendingSeek.current = target;
    if (!nextSrcWillChange && video.current && video.current.readyState >= 1) {
      video.current.currentTime = target;
      pendingSeek.current = null;
    }
  };

  const save = async () => {
    const saved = await persistNow(draft);
    setDraft(saved);
    toast("Proyecto guardado en este dispositivo");
  };

  /* --- subir / cambiar película principal --- */
  const uploadMainVideo = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) return toast("Elige un archivo de vídeo", "error");
    setUploading(true);
    try {
      const url = URL.createObjectURL(file);
      const { blob: posterBlob, duration } = await videoPoster(url, 0.5);
      URL.revokeObjectURL(url);
      const videoId = await putMedia(file, file.name);
      const posterId = await putMedia(posterBlob, `${file.name}.jpg`);
      const cover = draft.cover?.mediaId || draft.cover?.url ? draft.cover : { mediaId: posterId };
      const chapters = draft.chapters.length
        ? draft.chapters
        : [{ id: uid(), title: "Escena 01", start: 0, poster: { mediaId: posterId } }];
      const next = {
        ...draft,
        video: { mediaId: videoId },
        cover,
        duration: duration || draft.duration,
        chapters,
      };
      await persistNow(next);
      setDraft(next);
      setSelectedId(chapters[0]?.id ?? null);
      setCutEnd(next.duration);
      setTime(0);
      toast("Película principal guardada");
    } catch (e) {
      toast(e.message || "No se pudo leer el vídeo principal", "error");
    } finally {
      setUploading(false);
    }
  };

  const uploadCover = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Elige una imagen", "error");
    const mediaId = await putMedia(file, file.name);
    update({ cover: { mediaId } }, true);
    toast("Carátula actualizada");
  };

  /* --- añadir / mover / eliminar capítulos --- */
  const addChapter = async () => {
    let poster = draft.cover;
    if (hasVideo && src) {
      try {
        const p = await videoPoster(src, time);
        poster = { mediaId: await putMedia(p.blob, "capitulo.jpg") };
      } catch {
        /* conserva la portada */
      }
    }
    const created = {
      id: uid(),
      title: `Escena ${String(draft.chapters.length + 1).padStart(2, "0")}`,
      start: Math.round(time * 10) / 10,
      poster,
    };
    const chapters = orderedChapters([...draft.chapters, created]);
    update({ chapters }, true);
    setSelectedId(created.id);
    toast("Capítulo añadido");
  };

  const addPhotoChapter = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Elige una imagen", "error");
    const mediaId = await putMedia(file, file.name);
    if (photoTarget.current) {
      updateChapter(photoTarget.current, { poster: { mediaId } }, true);
      photoTarget.current = null;
      toast("Póster del capítulo actualizado");
      return;
    }
    const created = {
      id: uid(),
      title: file.name.replace(/\.[^.]+$/, "") || `Escena ${String(draft.chapters.length + 1).padStart(2, "0")}`,
      start: draft.duration || 0,
      poster: { mediaId },
    };
    const synced = syncSequentialStarts([...draft.chapters, created], draft.video, draft.duration);
    update({ chapters: synced.chapters, duration: synced.duration, cover: draft.cover?.mediaId || draft.cover?.url ? draft.cover : { mediaId } }, true);
    setSelectedId(created.id);
    toast("Capítulo con foto añadido");
  };

  const moveChapter = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= draft.chapters.length) return;
    const list = [...draft.chapters];
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
    const synced = syncSequentialStarts(list, draft.video, draft.duration);
    update({ chapters: synced.chapters, duration: synced.duration }, true);
  };

  const removeChapter = (id) => {
    const idx = draft.chapters.findIndex((c) => c.id === id);
    const remaining = draft.chapters.filter((c) => c.id !== id);
    const synced = syncSequentialStarts(remaining, draft.video, draft.duration);
    update({ chapters: synced.chapters, duration: synced.duration }, true);
    if (selectedId === id) {
      const next = synced.chapters[Math.min(idx, synced.chapters.length - 1)];
      setSelectedId(next?.id ?? null);
    }
    toast("Capítulo eliminado");
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
      let chapters;
      if (replaceTarget.current && clips[0]) {
        chapters = draft.chapters.map((c) => (c.id === replaceTarget.current ? { ...c, ...clips[0], id: c.id, title: c.title } : c));
      } else {
        chapters = [...draft.chapters, ...clips];
      }
      const synced = syncSequentialStarts(chapters, draft.video, draft.duration);
      const next = {
        ...draft,
        chapters: synced.chapters,
        duration: synced.duration,
        cover: draft.cover?.mediaId || draft.cover?.url ? draft.cover : synced.chapters[0]?.poster ?? {},
      };
      await persistNow(next);
      setDraft(next);
      if (clips[0] && !replaceTarget.current) setSelectedId(clips[0].id);
      toast(`${clips.length} clip(s) guardado(s) en esta película`);
    } catch (e) {
      toast(e.message || "No se pudieron guardar los clips", "error");
    } finally {
      setUploading(false);
      replaceTarget.current = null;
    }
  };

  /* --- exportación estándar --- */
  const downloadVideo = async () => {
    setExporting(true);
    try {
      const saved = await persistNow(draft);
      if (saved.video) {
        await downloadMovieFile(saved);
        toast("Vídeo descargado (archivo estándar)");
      } else {
        const blob = await renderMovieVideo(saved);
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        downloadBlob(blob, `${slug(saved.title)}.${ext}`);
        toast("Vídeo montado y descargado");
      }
    } catch (e) {
      toast(e.message || "No se pudo descargar el vídeo", "error");
    } finally {
      setExporting(false);
    }
  };

  const downloadZip = async () => {
    setExporting(true);
    try {
      const saved = await persistNow(draft);
      const z = await buildLibraryZip({ type: "movie", id: saved.id });
      downloadBlob(z.blob, z.filename);
      toast("Paquete ZIP descargado");
    } catch (e) {
      toast(e.message || "No se pudo crear el paquete ZIP", "error");
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
        const coverId = await putMedia(poster.blob, "portada-corte.jpg");
        await saveMovie({
          ...draft,
          id: `m-${uid()}`,
          title: `${draft.title} · Corte`,
          video: { mediaId: id },
          cover: { mediaId: coverId },
          duration: cutEnd - cutStart,
          chapters: [{ id: uid(), title: "Escena 01", start: 0, poster: { mediaId: coverId } }],
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
    if (!current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const mediaId = await putMedia(blob, "voz-en-off.webm");
        updateChapter(current.id, { voiceOver: { mediaId } }, true);
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
    updateChapter(current.id, { voiceOver: { mediaId } }, true);
    toast("Voz en off añadida a este capítulo");
  };

  const toggleLinkedSlide = (slideId) => {
    const currentList = draft.linkedSlideshows || [];
    const next = currentList.includes(slideId) ? currentList.filter((x) => x !== slideId) : [...currentList, slideId];
    update({ linkedSlideshows: next }, true);
  };

  return (
    <main className="editor-layout">
      <aside>
        <Control data-nav onClick={() => navigate("#/")} style={{ marginBottom: 14 }}>
          <ArrowLeft /> Menú DVD
        </Control>

        <section className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <h2 className="font-display text-gold" style={{ margin: "0 0 10px", fontSize: 16, fontVariant: "small-caps" }}>
            Película principal
          </h2>
          <p className="text-muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
            {draft.video ? `Vídeo cargado · ${fmtTime(draft.duration, false)}` : "Sin vídeo principal (solo clips o fotos)"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Control data-nav className="btn-gold" disabled={uploading} onClick={() => mainVideoInput.current?.click()}>
              <Film /> {uploading ? "Guardando…" : draft.video ? "Cambiar vídeo principal" : "Subir vídeo principal"}
            </Control>
            <Control data-nav className="btn-outline-cyan" onClick={() => coverInput.current?.click()}>
              <ImagePlus /> Cambiar carátula
            </Control>
          </div>
          <input
            ref={mainVideoInput}
            type="file"
            accept="video/*"
            className="hidden-file"
            aria-label="Subir vídeo principal"
            onChange={(e) => {
              void uploadMainVideo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            className="hidden-file"
            aria-label="Cambiar carátula"
            onChange={(e) => {
              void uploadCover(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </section>

        <RemasterPanel
          value={draft.remaster}
          onChange={(r) => update({ remaster: r })}
          onApply={async () => {
            const updated = { ...draft, remasterOn: true };
            setDraft(updated);
            await persistNow(updated);
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
            {current?.title ?? "Selecciona o añade un capítulo"}
          </p>
          {current?.voiceOver ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Control
                data-nav
                className="btn-outline-gold"
                onClick={async () => {
                  const u = await resolveSrc(current.voiceOver);
                  if (u && voiceAudio.current) {
                    voiceAudio.current.src = u;
                    voiceAudio.current.play().catch(() => {});
                  }
                }}
              >
                <Play /> Escuchar voz en off
              </Control>
              <Control data-nav className="btn-danger" onClick={() => updateChapter(current.id, { voiceOver: undefined }, true)}>
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
              void uploadVoice(e.target.files?.[0]);
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
            onLoadedMetadata={(el) => {
              if (pendingSeek.current != null) {
                el.currentTime = pendingSeek.current;
                pendingSeek.current = null;
              }
            }}
            onTime={(t) => setTime(t)}
            onEnded={() => setPlaying(false)}
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
              disabled={!hasVideo}
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
              <Plus /> Capítulo aquí
            </Control>
          </div>
          <input
            aria-label="Posición del editor"
            data-nav
            type="range"
            className="dvd-range"
            style={{ "--p": `${previewDuration ? (time / previewDuration) * 100 : 0}%` }}
            min="0"
            max={Math.max(0.1, previewDuration)}
            step="0.1"
            value={Math.min(time, previewDuration || 0)}
            onChange={(e) => seekTo(Number(e.target.value))}
          />
          <div className="timeline" style={{ marginTop: 12 }}>
            {draft.chapters.map((c, i) => (
              <button key={c.id} data-nav data-on={c.id === current?.id} onClick={() => selectChapter(c)} title={c.title}>
                {i + 1}. {c.title}
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

        {allSlides.length > 0 && (
          <div className="panel" style={{ padding: 14, marginTop: 14 }}>
            <span className="kicker" style={{ display: "block", marginBottom: 8 }}>
              <Images style={{ width: 13, height: 13, verticalAlign: -2 }} /> Pases de fotos vinculados (Galería)
            </span>
            <div className="row wrap" style={{ gap: 6 }}>
              {allSlides.map((s) => {
                const on = (draft.linkedSlideshows || []).includes(s.id);
                return (
                  <button key={s.id} data-nav className="chip" data-on={on} onClick={() => toggleLinkedSlide(s.id)} style={{ fontSize: 12, padding: "5px 12px" }}>
                    {on ? "✓ " : ""}{s.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
        <div className="row wrap" style={{ justifyContent: "space-between", marginBottom: 12, gap: 6 }}>
          <h2 className="kicker" style={{ margin: 0 }}>
            Capítulos ({draft.chapters.length})
          </h2>
          <div className="row" style={{ gap: 6 }}>
            <Control
              data-nav
              className="btn-outline-cyan"
              style={{ padding: "6px 12px", fontSize: 12 }}
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
            <Control
              data-nav
              style={{ padding: "6px 10px", fontSize: 12 }}
              title="Añadir escena desde foto"
              onClick={() => {
                photoTarget.current = null;
                chapterPhotoInput.current?.click();
              }}
            >
              <ImagePlus /> Foto
            </Control>
          </div>
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
        <input
          ref={chapterPhotoInput}
          aria-label="Foto para capítulo"
          type="file"
          accept="image/*"
          className="hidden-file"
          onChange={(e) => {
            void addPhotoChapter(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {draft.chapters.map((c, i) => (
            <div key={c.id} className="panel" style={{ padding: 10, borderColor: c.id === current?.id ? "var(--cyan)" : undefined }}>
              <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button data-nav onClick={() => selectChapter(c)} style={{ padding: 0, border: 0, background: "none", flex: "none" }} aria-label={`Ver capítulo ${c.title}`}>
                    <Thumb src={c.poster} style={{ width: 92, aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, display: "block" }} alt="" />
                  </button>
                  <button
                    data-nav
                    className="btn-ghost"
                    style={{ border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, padding: "2px 6px", color: "var(--muted)" }}
                    onClick={() => {
                      photoTarget.current = c.id;
                      chapterPhotoInput.current?.click();
                    }}
                  >
                    Cambiar foto
                  </button>
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <input
                    aria-label={`Título del capítulo ${i + 1}`}
                    className="field"
                    style={{ padding: "6px 8px", fontSize: 13 }}
                    value={c.title}
                    onChange={(e) => updateChapter(c.id, { title: e.target.value })}
                  />
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    {!c.clip && (
                      <input
                        aria-label={`Inicio del capítulo ${i + 1} (segundos)`}
                        type="number"
                        className="field"
                        style={{ padding: "4px 8px", fontSize: 12, width: 78 }}
                        value={c.start}
                        min="0"
                        step="0.1"
                        onChange={(e) => updateChapter(c.id, { start: Math.max(0, Number(e.target.value)) })}
                      />
                    )}
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {c.clip ? `clip ${fmtTime(c.clipDuration ?? 0, false)}` : `en ${fmtTime(c.start, false)}`}
                      {c.voiceOver ? " · 🎙" : ""}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <Control data-nav className="btn-icon" style={{ padding: 5 }} title="Subir orden" aria-label={`Subir ${c.title}`} disabled={i === 0} onClick={() => moveChapter(i, -1)}>
                    <ArrowUp />
                  </Control>
                  <Control data-nav className="btn-icon" style={{ padding: 5 }} title="Bajar orden" aria-label={`Bajar ${c.title}`} disabled={i === draft.chapters.length - 1} onClick={() => moveChapter(i, 1)}>
                    <ArrowDown />
                  </Control>
                  <Control
                    data-nav
                    className="btn-icon"
                    style={{ padding: 5 }}
                    title={c.clip ? "Sustituir clip" : "Subir clip para este capítulo"}
                    aria-label={`Subir clip de ${c.title}`}
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
                  <Control data-nav className="btn-icon" style={{ padding: 5 }} title="Eliminar capítulo" aria-label={`Eliminar capítulo ${c.title}`} onClick={() => removeChapter(c.id)}>
                    <Trash2 />
                  </Control>
                </div>
              </div>
            </div>
          ))}
          {draft.chapters.length === 0 && (
            <p className="text-muted">Sin capítulos. Sube una película principal o añade clips/fotos de escenas arriba.</p>
          )}
        </div>
      </aside>
    </main>
  );
}
