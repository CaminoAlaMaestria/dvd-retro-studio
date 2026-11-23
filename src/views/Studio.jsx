import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Clapperboard, Mic, Monitor, Music, Play, Plus, Square, Trash2, Upload, Video } from "lucide-react";
import { Control, Thumb } from "../components.jsx";
import { fmtTime, resolveSrc, toast, videoPoster } from "../lib/media.js";
import { putMedia, saveMovie, uid } from "../lib/db.js";
import { Mixer, getAudioCtx } from "../lib/audio.js";
import { startFreeMusic } from "../lib/music.js";
import { DEFAULT_REMASTER, FREE_TRACKS, newMovie } from "../lib/types.js";

/**
 * Estudio de grabación: cámara/pantalla + fotos + consola multipista
 * (voz en directo, voz en off y música por separado + ducking automático).
 */
export function Studio({ navigate }) {
  const [source, setSource] = useState("camera");
  const [filter, setFilter] = useState("clean");
  const [duck, setDuck] = useState(false);
  const [devicesOn, setDevicesOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(null); // { recorder, kind }
  const [takes, setTakes] = useState([]);
  const [selectedTake, setSelectedTake] = useState(null);
  const [music, setMusic] = useState({ kind: "free", trackId: "amanecer" });
  const [mix, setMix] = useState({ voice: 0.8, voiceover: 0.8, music: 0.6, master: 0.9, muted: {}, solo: {} });
  const [previewTake, setPreviewTake] = useState(null);

  const previewRef = useRef(null);
  const camStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const mixerRef = useRef(null);
  const duckRef = useRef(duck);
  duckRef.current = duck;
  const musicHandleRef = useRef(null);
  const musicAudioRef = useRef(null);
  const voiceAudioRef = useRef(null);
  const takeVideoRef = useRef(null);
  const levelRefs = useRef({});
  const voiceInput = useRef(null);

  const ensureMixer = useCallback(() => {
    if (!mixerRef.current) mixerRef.current = new Mixer();
    getAudioCtx().resume();
    return mixerRef.current;
  }, []);

  /* Medidores de nivel + ducking automático (actualización directa sin re-render) */
  useEffect(() => {
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const m = mixerRef.current;
      if (!m) return;
      for (const id of ["voice", "voiceover", "music", "master"]) {
        const el = levelRefs.current[id];
        if (el) el.style.height = `${Math.round(m.level(id) * 100)}%`;
      }
      if (duckRef.current) {
        const speaking = m.level("voice") > 0.14 || m.level("voiceover") > 0.14;
        m.setDuck("music", speaking ? 0.25 : 1);
      } else {
        m.setDuck("music", 1);
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Limpieza al salir */
  useEffect(() => {
    return () => {
      musicHandleRef.current?.stop();
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      mixerRef.current?.dispose();
    };
  }, []);

  const enableDevices = async (mode = source) => {
    setBusy(true);
    setSource(mode);
    try {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      let videoStream;
      if (mode === "screen") {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          toast("La grabación de pantalla no está disponible en este dispositivo móvil; usa Cámara.", "error");
          setSource("camera");
          setBusy(false);
          return;
        }
        videoStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          toast("Tu navegador no permite acceso a la cámara aquí.", "error");
          setBusy(false);
          return;
        }
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      }
      camStreamRef.current = videoStream;
      if (previewRef.current) previewRef.current.srcObject = videoStream;

      const mixer = ensureMixer();
      // Si no tenemos micrófono conectado aún, conectamos el audio de cámara o pedimos mic aparte en modo pantalla
      if (!micStreamRef.current) {
        if (mode === "camera" && videoStream.getAudioTracks().length) {
          micStreamRef.current = new MediaStream(videoStream.getAudioTracks());
          mixer.connectMic(micStreamRef.current);
        } else {
          try {
            micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            mixer.connectMic(micStreamRef.current);
          } catch {
            toast("Micrófono no disponible; puedes grabar sin voz");
          }
        }
      }
      videoStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setDevicesOn(false);
        if (recording?.recorder?.state === "recording") recording.recorder.stop();
      });
      setDevicesOn(true);
      toast(mode === "screen" ? "Pantalla lista para grabar" : "Cámara y micrófono activos");
    } catch {
      toast("No se pudo acceder a la cámara o pantalla. Revisa los permisos.", "error");
    } finally {
      setBusy(false);
    }
  };

  /* --- música de fondo (libre o propia) --- */
  const applyMusic = useCallback(
    (next) => {
      const mixer = ensureMixer();
      musicHandleRef.current?.stop();
      musicHandleRef.current = null;
      const a = musicAudioRef.current;
      if (a) a.pause();
      if (next.kind === "free") {
        musicHandleRef.current = startFreeMusic(next.trackId, { destination: mixer.ch.music.input, volume: 0.8 });
      } else if (next.kind === "own" && next.mediaId) {
        resolveSrc({ mediaId: next.mediaId }).then((u) => {
          if (!u || !musicAudioRef.current) return;
          if (!musicAudioRef.current.dataset.connected) {
            mixer.connectElement(musicAudioRef.current, "music");
            musicAudioRef.current.dataset.connected = "1";
          }
          musicAudioRef.current.src = u;
          musicAudioRef.current.play().catch(() => {});
        });
      }
      setMusic(next);
    },
    [ensureMixer]
  );

  /* --- grabación de vídeo con la mezcla de audio --- */
  const startVideoTake = () => {
    const mixer = ensureMixer();
    const cam = camStreamRef.current;
    if (!cam) return toast("Activa primero la cámara", "error");
    const dest = mixer.recordDestination();
    mixer.connectRecord(dest);
    const combined = new MediaStream([...cam.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((t) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)
    );
    const rec = mime ? new MediaRecorder(combined, { mimeType: mime }) : new MediaRecorder(combined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      setRecording(null);
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      try {
        const { blob: posterBlob, duration } = await videoPoster(url, 0.5);
        const take = {
          id: uid(),
          kind: "video",
          title: `Toma ${takes.length + 1}`,
          mediaId: await putMedia(blob, "toma.webm"),
          posterMediaId: await putMedia(posterBlob, "toma.jpg"),
          duration,
          voiceOverMediaId: null,
        };
        setTakes((t) => [...t, take]);
        setSelectedTake(take.id);
        toast("Toma de vídeo guardada");
      } catch {
        toast("No se pudo guardar la toma", "error");
      }
      URL.revokeObjectURL(url);
    };
    rec.start();
    setRecording({ recorder: rec, kind: "video" });
  };

  const takePhoto = async () => {
    const v = previewRef.current;
    if (!v || !v.videoWidth) return toast("Activa primero la cámara", "error");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.filter = filter === "vhs" ? "sepia(.3) contrast(1.15) saturate(1.15)" : filter === "warm" ? "sepia(.35) saturate(1.25) contrast(1.05)" : "none";
    ctx.drawImage(v, 0, 0);
    c.toBlob(async (blob) => {
      const take = {
        id: uid(),
        kind: "photo",
        title: `Foto ${takes.length + 1}`,
        mediaId: await putMedia(blob, "foto.jpg"),
        posterMediaId: null,
        duration: 0,
        voiceOverMediaId: null,
      };
      setTakes((t) => [...t, take]);
      setSelectedTake(take.id);
      toast("Foto guardada como toma");
    }, "image/jpeg", 0.9);
  };

  /* --- voz en off para la toma seleccionada --- */
  const startVoiceTake = () => {
    const take = takes.find((t) => t.id === selectedTake);
    if (!take) return toast("Selecciona primero una toma", "error");
    if (!micStreamRef.current) return toast("Activa primero el micrófono", "error");
    const rec = new MediaRecorder(micStreamRef.current);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      setRecording(null);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const mediaId = await putMedia(blob, "voz-en-off.webm");
      setTakes((t) => t.map((x) => (x.id === take.id ? { ...x, voiceOverMediaId: mediaId } : x)));
      toast("Voz en off añadida a la toma");
    };
    rec.start();
    setRecording({ recorder: rec, kind: "voice" });
  };

  const uploadVoiceTake = async (file) => {
    const take = takes.find((t) => t.id === selectedTake);
    if (!file || !take) return;
    const mediaId = await putMedia(file, file.name);
    setTakes((t) => t.map((x) => (x.id === take.id ? { ...x, voiceOverMediaId: mediaId } : x)));
    toast("Voz en off añadida a la toma");
  };

  /* --- vista previa de una toma con su voz en off --- */
  const preview = async (take) => {
    setPreviewTake(take);
    const mixer = ensureMixer();
    const a = voiceAudioRef.current;
    if (a && take.voiceOverMediaId) {
      if (!a.dataset.connected) {
        mixer.connectElement(a, "voiceover");
        a.dataset.connected = "1";
      }
      const u = await resolveSrc({ mediaId: take.voiceOverMediaId });
      if (u) {
        a.src = u;
        a.currentTime = 0;
        a.play().catch(() => {});
      }
    }
  };

  const createMovie = async () => {
    if (!takes.length) return toast("Graba al menos una toma", "error");
    const movie = newMovie("Mi película casera");
    movie.kicker = "Producción propia";
    movie.subtitle = "Grabada con el Estudio DVD Retro";
    let acc = 0;
    movie.chapters = takes.map((t, i) => {
      const ch = {
        id: uid(),
        title: t.title,
        start: acc,
        poster: t.kind === "photo" ? { mediaId: t.mediaId } : { mediaId: t.posterMediaId },
        ...(t.kind === "video" ? { clip: { mediaId: t.mediaId }, clipDuration: t.duration } : {}),
        ...(t.voiceOverMediaId ? { voiceOver: { mediaId: t.voiceOverMediaId } } : {}),
      };
      acc += t.kind === "video" ? t.duration : 4;
      return ch;
    });
    movie.duration = acc;
    movie.cover = movie.chapters[0]?.poster ?? {};
    movie.photos = takes.filter((t) => t.kind === "photo").map((t) => ({ mediaId: t.mediaId }));
    movie.remaster =
      filter === "vhs"
        ? { ...DEFAULT_REMASTER, vhs: 75 }
        : filter === "warm"
          ? { sharp: 20, denoise: 10, color: 80, vhs: 15 }
          : { sharp: 0, denoise: 0, color: 50, vhs: 0 };
    movie.remasterOn = filter !== "clean";
    await saveMovie(movie);
    toast("Película creada — ábrela en el editor para remasterizarla");
    navigate(`#/editor/${movie.id}`);
  };

  const setVol = (id, v) => {
    ensureMixer().setVolume(id, v);
    setMix((m) => ({ ...m, [id]: v }));
  };
  const toggleMute = (id) => {
    const next = !mix.muted[id];
    ensureMixer().setMuted(id, next);
    setMix((m) => ({ ...m, muted: { ...m.muted, [id]: next } }));
  };
  const toggleSolo = (id) => {
    const next = !mix.solo[id];
    ensureMixer().setSolo(id, next);
    setMix((m) => ({ ...m, solo: { ...m.solo, [id]: next } }));
  };

  const selected = takes.find((t) => t.id === selectedTake);
  const previewUrl = previewTake ? (previewTake.kind === "photo" ? undefined : undefined) : undefined;
  const [takeUrl, setTakeUrl] = useState(null);
  useEffect(() => {
    if (!previewTake || previewTake.kind !== "video") return setTakeUrl(null);
    resolveSrc({ mediaId: previewTake.mediaId }).then(setTakeUrl);
  }, [previewTake]);
  const previewPhotoUrl = previewTake?.kind === "photo" ? undefined : undefined;

  return (
    <main className="studio-layout">
      <section style={{ minWidth: 0 }}>
        <div className="row wrap" style={{ justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <button data-nav className="chip" data-on={source === "camera"} disabled={!!recording} onClick={() => enableDevices("camera")}>
              <Camera style={{ width: 14, height: 14, verticalAlign: -2 }} /> Cámara
            </button>
            <button data-nav className="chip" data-on={source === "screen"} disabled={!!recording} onClick={() => enableDevices("screen")}>
              <Monitor style={{ width: 14, height: 14, verticalAlign: -2 }} /> Pantalla
            </button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {[
              ["clean", "Limpio"],
              ["vhs", "VHS 2004"],
              ["warm", "Cine 35mm"],
            ].map(([id, label]) => (
              <button key={id} data-nav className="chip" data-on={filter === id} onClick={() => setFilter(id)} style={{ padding: "5px 12px", fontSize: 12 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="record-preview">
          {previewTake ? (
            previewTake.kind === "photo" ? (
              <Thumb src={{ mediaId: previewTake.mediaId }} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <video ref={takeVideoRef} src={takeUrl} autoPlay muted={false} controls style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            )
          ) : (
            <video ref={previewRef} autoPlay muted playsInline className={`record-filter-${filter}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <div className="record-grid-overlay" aria-hidden />
          {recording && (
            <span className="row" style={{ position: "absolute", left: 12, top: 12, background: "rgba(5,7,13,.75)", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
              <span className="rec-dot" /> GRABANDO {recording.kind === "video" ? "VÍDEO" : "VOZ EN OFF"}
            </span>
          )}
          {!devicesOn && !previewTake && (
            <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(5,7,13,.6)" }}>
              <div>
                <Camera style={{ width: 40, height: 40, color: "var(--gold)" }} />
                <p>Activa la cámara para empezar a grabar</p>
              </div>
            </div>
          )}
        </div>

        <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
          {!devicesOn ? (
            <Control data-nav className="btn-gold btn-lg" onClick={() => enableDevices(source)} disabled={busy}>
              {source === "screen" ? <Monitor /> : <Camera />} {source === "screen" ? "Compartir pantalla y micrófono" : "Activar cámara y micrófono"}
            </Control>
          ) : recording?.kind === "video" ? (
            <Control data-nav className="btn-danger btn-lg" onClick={() => recording.recorder.stop()}>
              <Square /> Detener toma
            </Control>
          ) : (
            <Control data-nav className="btn-gold btn-lg" onClick={startVideoTake}>
              <Video /> Grabar toma de vídeo
            </Control>
          )}
          <Control data-nav className="btn-outline-cyan btn-lg" onClick={takePhoto} disabled={!devicesOn}>
            <Camera /> Foto
          </Control>
          {recording?.kind === "voice" ? (
            <Control data-nav className="btn-danger btn-lg" onClick={() => recording.recorder.stop()}>
              <Square /> Detener voz en off
            </Control>
          ) : (
            <Control data-nav className="btn-outline-gold btn-lg" onClick={startVoiceTake} disabled={!selected}>
              <Mic /> Voz en off (toma seleccionada)
            </Control>
          )}
          <Control data-nav onClick={() => voiceInput.current?.click()} disabled={!selected}>
            <Upload /> Subir voz en off
          </Control>
          <input
            ref={voiceInput}
            type="file"
            accept="audio/*"
            className="hidden-file"
            aria-label="Subir voz en off"
            onChange={(e) => {
              uploadVoiceTake(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {previewTake && (
            <Control data-nav onClick={() => setPreviewTake(null)}>
              Volver a la cámara
            </Control>
          )}
        </div>

        <div className="panel" style={{ padding: 16, marginTop: 18 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <h2 className="font-display text-gold" style={{ margin: 0, fontSize: 18, fontVariant: "small-caps" }}>
              Tomas de la película
            </h2>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {takes.length} tomas · {fmtTime(takes.reduce((n, t) => n + (t.kind === "video" ? t.duration : 4), 0), false)}
            </span>
          </div>
          <div className="takes-list">
            {takes.map((t) => (
              <div key={t.id} className="take-item" style={t.id === selectedTake ? { borderColor: "var(--cyan)" } : undefined}>
                <button data-nav onClick={() => setSelectedTake(t.id)} style={{ padding: 0, border: 0, background: "none" }} aria-label={`Seleccionar ${t.title}`}>
                  <Thumb src={t.kind === "photo" ? { mediaId: t.mediaId } : { mediaId: t.posterMediaId }} alt="" />
                </button>
                <div className="grow" style={{ minWidth: 0 }}>
                  <input
                    aria-label="Título de la toma"
                    className="field"
                    style={{ padding: "4px 8px", fontSize: 13 }}
                    value={t.title}
                    onChange={(e) => setTakes((xs) => xs.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)))}
                  />
                  <span className="text-muted" style={{ fontSize: 11 }}>
                    {t.kind === "video" ? `vídeo ${fmtTime(t.duration, false)}` : "foto"}
                    {t.voiceOverMediaId ? " · 🎙 voz en off" : ""}
                  </span>
                </div>
                <Control data-nav className="btn-icon" title="Vista previa" aria-label={`Vista previa de ${t.title}`} onClick={() => preview(t)}>
                  <Play />
                </Control>
                <Control data-nav className="btn-icon" title="Eliminar toma" aria-label={`Eliminar ${t.title}`} onClick={() => setTakes((xs) => xs.filter((x) => x.id !== t.id))}>
                  <Trash2 />
                </Control>
              </div>
            ))}
            {takes.length === 0 && <p className="text-muted" style={{ margin: 0 }}>Aún no hay tomas. Graba vídeo, haz fotos y añade voces en off.</p>}
          </div>
          <Control data-nav className="btn-gold" onClick={createMovie} disabled={!takes.length} style={{ width: "100%", marginTop: 14, padding: "12px" }}>
            <Clapperboard /> Crear película con estas tomas
          </Control>
        </div>
      </section>

      <aside>
        <section className="panel" style={{ padding: 18 }}>
          <h2 className="font-display text-gold" style={{ margin: "0 0 6px", fontSize: 18, fontVariant: "small-caps" }}>
            Consola multipista
          </h2>
          <p className="text-muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
            Voz, voz en off y música por separado. La mezcla se graba con el vídeo.
          </p>
          <div className="mixer">
            <ChannelStrip id="voice" name="Voz" icon={<Mic />} mix={mix} levelRef={levelRefs} onVol={setVol} onMute={toggleMute} onSolo={toggleSolo} />
            <ChannelStrip id="voiceover" name="Voz en off" icon={<Play />} mix={mix} levelRef={levelRefs} onVol={setVol} onMute={toggleMute} onSolo={toggleSolo} />
            <ChannelStrip id="music" name="Música" icon={<Music />} mix={mix} levelRef={levelRefs} onVol={setVol} onMute={toggleMute} onSolo={toggleSolo} />
          </div>
          <div className="master-strip">
            <span className="kicker">Master</span>
            <input
              data-nav
              aria-label="Volumen master"
              type="range"
              className="dvd-range"
              style={{ "--p": `${mix.master * 100}%` }}
              min="0"
              max="1"
              step="0.01"
              value={mix.master}
              onChange={(e) => {
                ensureMixer().setMaster(Number(e.target.value));
                setMix((m) => ({ ...m, master: Number(e.target.value) }));
              }}
            />
            <div className="meter" style={{ width: 8, height: 28, borderRadius: 4, background: "#1a2238", overflow: "hidden", display: "flex", flexDirection: "column-reverse" }}>
              <div ref={(el) => (levelRefs.current.master = el)} style={{ background: "linear-gradient(180deg,var(--danger),var(--gold) 40%,#57e389)", height: "0%" }} />
            </div>
          </div>
        </section>

        <section className="panel" style={{ padding: 18, marginTop: 16 }}>
          <h2 className="font-display text-gold" style={{ margin: "0 0 12px", fontSize: 18, fontVariant: "small-caps" }}>
            Música de fondo
          </h2>
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            <button data-nav className="chip" data-on={music.kind === "free"} onClick={() => applyMusic({ kind: "free", trackId: music.trackId || "amanecer" })}>
              Libre de derechos
            </button>
            <button data-nav className="chip" data-on={music.kind === "own"} onClick={() => document.getElementById("studio-music-input")?.click()}>
              Mi música
            </button>
            <button data-nav className="chip" data-on={music.kind === "none"} onClick={() => applyMusic({ kind: "none" })}>
              Sin música
            </button>
          </div>
          {music.kind === "free" && (
            <select className="field" value={music.trackId} onChange={(e) => applyMusic({ kind: "free", trackId: e.target.value })}>
              {FREE_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {music.kind === "own" && <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>🎵 {music.name || "Elige un archivo de audio"}</p>}
          <input
            id="studio-music-input"
            type="file"
            accept="audio/*"
            className="hidden-file"
            aria-label="Subir música propia"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const mediaId = await putMedia(f, f.name);
              applyMusic({ kind: "own", mediaId, name: f.name });
            }}
          />
          <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
            <Plus style={{ width: 12, height: 12, verticalAlign: -2 }} /> Consejo: graba la toma con la música sonando y quedará mezclada en el vídeo.
          </p>
          <button
            data-nav
            className="chip"
            data-on={duck}
            onClick={() => setDuck((d) => !d)}
            style={{ width: "100%", marginTop: 10, padding: "8px 12px" }}
          >
            {duck ? "✓ Ducking auto activo (baja música al hablar)" : "Activar ducking automático"}
          </button>
        </section>

        <audio ref={musicAudioRef} loop className="hidden-file" />
        <audio ref={voiceAudioRef} className="hidden-file" />
      </aside>
    </main>
  );
}

function ChannelStrip({ id, name, icon, mix, levelRef, onVol, onMute, onSolo }) {
  return (
    <div className="channel">
      <span className="name">
        {icon} {name}
      </span>
      <div className="fader-wrap">
        <input
          data-nav
          aria-label={`Volumen de ${name}`}
          type="range"
          className="vertical-fader"
          min="0"
          max="1"
          step="0.01"
          value={mix[id]}
          onChange={(e) => onVol(id, Number(e.target.value))}
        />
        <div className="meter">
          <div ref={(el) => (levelRef.current[id] = el)} style={{ height: "0%" }} />
        </div>
      </div>
      <div className="toggles">
        <button data-nav className="mini-btn" data-on={!!mix.muted[id]} onClick={() => onMute(id)} aria-label={`Silenciar ${name}`} aria-pressed={!!mix.muted[id]}>
          M
        </button>
        <button data-nav className="mini-btn solo" data-on={!!mix.solo[id]} onClick={() => onSolo(id)} aria-label={`Solo ${name}`} aria-pressed={!!mix.solo[id]}>
          S
        </button>
      </div>
    </div>
  );
}
