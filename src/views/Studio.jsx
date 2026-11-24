import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Clapperboard, Disc, Mic, Monitor, Music, PictureInPicture2, Play, Plus, RefreshCw, Square, Trash2, Upload, Video, Volume2, VolumeX } from "lucide-react";
import { Control, Thumb } from "../components.jsx";
import { fmtTime, resolveSrc, toast, videoPoster } from "../lib/media.js";
import { putMedia, saveMovie, uid } from "../lib/db.js";
import { Mixer, getAudioCtx } from "../lib/audio.js";
import { startFreeMusic } from "../lib/music.js";
import { DEFAULT_REMASTER, FREE_TRACKS, newMovie } from "../lib/types.js";

/**
 * Estudio de grabación:
 * - Cámara (con selector de cámara trasera/frontal y dispositivos USB)
 * - Pantalla (PC)
 * - Pantalla + Cámara en vivo (PiP para directos)
 * - Captura VHS analógica (capturadora USB vídeo + audio de línea sin filtros + 4:3)
 * + Consola multipista (Voz/Entrada, Voz en off/Sistema y Música + ducking).
 */
export function Studio({ navigate }) {
  const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const canScreen = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  const [source, setSource] = useState("camera"); // camera | screen | pip | vhs
  const [facing, setFacing] = useState(isTouch ? "environment" : "user");
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [selectedMicId, setSelectedMicId] = useState("");
  const [pipCorner, setPipCorner] = useState("br"); // br | bl | tr | tl
  const [aspect, setAspect] = useState("16/9"); // 16/9 | 4/3
  const [monitorOn, setMonitorOn] = useState(false);

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
  const [takeUrl, setTakeUrl] = useState(null);

  const previewRef = useRef(null); // vídeo principal (cámara, pantalla o VHS)
  const pipCamRef = useRef(null); // cámara secundaria en modo Pantalla + Cámara
  const pipCanvasRef = useRef(null); // compositor en directo para Pantalla + Cámara
  const pipTimerRef = useRef(null);

  const camStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const mixerRef = useRef(null);
  const duckRef = useRef(duck);
  duckRef.current = duck;
  const pipCornerRef = useRef(pipCorner);
  pipCornerRef.current = pipCorner;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const musicHandleRef = useRef(null);
  const musicAudioRef = useRef(null);
  const voiceAudioRef = useRef(null);
  const takeVideoRef = useRef(null);
  const levelRefs = useRef({});
  const voiceInput = useRef(null);

  const ensureMixer = useCallback(() => {
    if (!mixerRef.current) {
      mixerRef.current = new Mixer();
      mixerRef.current.setMonitor(monitorOn);
    }
    getAudioCtx().resume();
    return mixerRef.current;
  }, [monitorOn]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const vids = list.filter((d) => d.kind === "videoinput");
      const auds = list.filter((d) => d.kind === "audioinput");
      setCameras(vids);
      setMics(auds);
    } catch {
      /* navegador sin soporte */
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    mixerRef.current?.setMonitor(monitorOn);
  }, [monitorOn]);

  /* Medidores de nivel + ducking automático */
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

  const stopPipLoop = useCallback(() => {
    if (pipTimerRef.current) {
      clearInterval(pipTimerRef.current);
      pipTimerRef.current = null;
    }
  }, []);

  const stopAllStreams = useCallback(() => {
    stopPipLoop();
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    screenStreamRef.current = null;
    micStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    if (pipCamRef.current) pipCamRef.current.srcObject = null;
  }, [stopPipLoop]);

  /* Limpieza al salir */
  useEffect(() => {
    return () => {
      musicHandleRef.current?.stop();
      stopAllStreams();
      mixerRef.current?.dispose();
    };
  }, [stopAllStreams]);

  /* Compositor en vivo para Pantalla + Cámara (PiP) */
  const startPipCompositor = useCallback(() => {
    stopPipLoop();
    const cv = pipCanvasRef.current;
    const scrV = previewRef.current;
    const camV = pipCamRef.current;
    if (!cv || !scrV || !camV) return;
    cv.width = 1280;
    cv.height = 720;
    const ctx = cv.getContext("2d");

    pipTimerRef.current = setInterval(() => {
      if (!ctx) return;
      const W = cv.width;
      const H = cv.height;
      ctx.fillStyle = "#05070d";
      ctx.fillRect(0, 0, W, H);

      const flt =
        filterRef.current === "vhs"
          ? "sepia(.3) contrast(1.15) saturate(1.15)"
          : filterRef.current === "warm"
            ? "sepia(.35) saturate(1.25) contrast(1.05)"
            : "none";
      ctx.filter = flt;

      if (scrV.readyState >= 2 && scrV.videoWidth) {
        const sr = scrV.videoWidth / scrV.videoHeight;
        const dr = W / H;
        let dw = W;
        let dh = H;
        let dx = 0;
        let dy = 0;
        if (sr > dr) {
          dh = W / sr;
          dy = (H - dh) / 2;
        } else {
          dw = H * sr;
          dx = (W - dw) / 2;
        }
        ctx.drawImage(scrV, dx, dy, dw, dh);
      }

      if (camV.readyState >= 2 && camV.videoWidth) {
        const pw = Math.round(W * 0.24);
        const ph = Math.round(pw * (camV.videoHeight / camV.videoWidth));
        const margin = 24;
        const corner = pipCornerRef.current;
        const px = corner.endsWith("l") ? margin : W - pw - margin;
        const py = corner.startsWith("t") ? margin : H - ph - margin;

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 16);
        else ctx.rect(px, py, pw, ph);
        ctx.clip();
        ctx.drawImage(camV, px, py, pw, ph);
        ctx.restore();

        ctx.filter = "none";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#6fd3f2";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 16);
        else ctx.rect(px, py, pw, ph);
        ctx.stroke();
      }
      ctx.filter = "none";
    }, 33);
  }, [stopPipLoop]);

  const buildVideoConstraint = (camId, facingMode, isVhs) => {
    if (camId) return { deviceId: { exact: camId }, ...(isVhs ? { width: { ideal: 720 }, height: { ideal: 576 } } : {}) };
    if (isVhs) return { width: { ideal: 720 }, height: { ideal: 576 } };
    return { facingMode: { ideal: facingMode } };
  };

  const buildAudioConstraint = (micId, isVhs) => {
    const raw = isVhs ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : {};
    return micId ? { deviceId: { exact: micId }, ...raw } : Object.keys(raw).length ? raw : true;
  };

  const enableDevices = async (
    mode = source,
    opts = {}
  ) => {
    const nextFacing = opts.facing ?? facing;
    const camId = opts.camId !== undefined ? opts.camId : selectedCamId;
    const micId = opts.micId !== undefined ? opts.micId : selectedMicId;

    if ((mode === "screen" || mode === "pip") && !canScreen) {
      toast("La captura de pantalla no está disponible en este dispositivo móvil; usa Cámara.", "error");
      setSource("camera");
      return;
    }

    setBusy(true);
    setSource(mode);
    if (mode === "vhs" && !opts.keepAspect) setAspect("4/3");
    else if (mode !== "vhs" && !opts.keepAspect && aspect === "4/3") setAspect("16/9");

    // En VHS activamos monitorización por defecto para oír la cinta; en cámara la dejamos opcional para evitar acoples
    if (opts.autoMonitor !== false) {
      const wantMon = mode === "vhs";
      setMonitorOn(wantMon);
      mixerRef.current?.setMonitor(wantMon);
    }

    try {
      stopAllStreams();
      const mixer = ensureMixer();
      const isVhs = mode === "vhs";

      if (mode === "camera" || mode === "vhs") {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Tu navegador no permite acceso a la cámara o capturadora.");
        }
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraint(camId, nextFacing, isVhs),
          audio: false,
        });
        camStreamRef.current = videoStream;
        if (previewRef.current) previewRef.current.srcObject = videoStream;

        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: buildAudioConstraint(micId, isVhs),
          });
          micStreamRef.current = audioStream;
          mixer.replaceStreamSource(audioStream, "voice");
        } catch {
          mixer.replaceStreamSource(null, "voice");
          toast(isVhs ? "Audio del VHS no conectado; selecciona su entrada de audio" : "Micrófono no disponible; puedes grabar sin voz");
        }

        videoStream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setDevicesOn(false);
          if (recording?.recorder?.state === "recording") recording.recorder.stop();
        });
      } else if (mode === "screen") {
        const scrStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = scrStream;
        if (previewRef.current) previewRef.current.srcObject = scrStream;

        if (scrStream.getAudioTracks().length) {
          mixer.replaceStreamSource(new MediaStream(scrStream.getAudioTracks()), "voiceover");
        }
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraint(micId, false) });
          micStreamRef.current = audioStream;
          mixer.replaceStreamSource(audioStream, "voice");
        } catch {
          toast("Micrófono no disponible; se grabará el audio de pantalla");
        }

        scrStream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setDevicesOn(false);
          if (recording?.recorder?.state === "recording") recording.recorder.stop();
        });
      } else if (mode === "pip") {
        const scrStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = scrStream;
        if (previewRef.current) {
          previewRef.current.srcObject = scrStream;
          previewRef.current.play().catch(() => {});
        }

        // Cámara frontal/seleccionada simultánea en esquina (PiP)
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraint(camId, "user", false),
          audio: false,
        });
        camStreamRef.current = camStream;
        if (pipCamRef.current) {
          pipCamRef.current.srcObject = camStream;
          pipCamRef.current.play().catch(() => {});
        }

        if (scrStream.getAudioTracks().length) {
          mixer.replaceStreamSource(new MediaStream(scrStream.getAudioTracks()), "voiceover");
        }
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraint(micId, false) });
          micStreamRef.current = audioStream;
          mixer.replaceStreamSource(audioStream, "voice");
        } catch {
          toast("Micrófono no disponible; puedes grabar sin voz");
        }

        scrStream.getVideoTracks()[0]?.addEventListener("ended", () => {
          stopPipLoop();
          setDevicesOn(false);
          if (recording?.recorder?.state === "recording") recording.recorder.stop();
        });
        startPipCompositor();
      }

      await refreshDevices();
      setDevicesOn(true);
      const okMsg =
        mode === "screen"
          ? "Pantalla lista para grabar"
          : mode === "pip"
            ? "Directo listo: pantalla + cámara frontal activas"
            : mode === "vhs"
              ? "Capturadora VHS lista — dale al Play en tu reproductor"
              : "Cámara y micrófono activos";
      toast(okMsg);
    } catch (err) {
      toast(err?.message || "No se pudo acceder a la cámara, capturadora o pantalla. Revisa los permisos.", "error");
      setDevicesOn(false);
    } finally {
      setBusy(false);
    }
  };

  const toggleFacing = () => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    setSelectedCamId("");
    if (devicesOn && (source === "camera" || source === "pip")) {
      enableDevices(source, { facing: next, camId: "", autoMonitor: false });
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
    let videoTracks = [];
    if (source === "pip") {
      const cv = pipCanvasRef.current;
      if (!cv) return toast("Activa primero Pantalla + Cámara", "error");
      const cap = cv.captureStream(30);
      videoTracks = cap.getVideoTracks();
    } else {
      const activeStream = source === "screen" ? screenStreamRef.current : camStreamRef.current;
      if (!activeStream) return toast("Activa primero la fuente de vídeo", "error");
      videoTracks = activeStream.getVideoTracks();
    }
    if (!videoTracks.length) return toast("No hay señal de vídeo activa", "error");

    const dest = mixer.recordDestination();
    mixer.connectRecord(dest);
    const combined = new MediaStream([...videoTracks, ...dest.stream.getAudioTracks()]);
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
      (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)
    );
    const rec = mime ? new MediaRecorder(combined, { mimeType: mime }) : new MediaRecorder(combined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      setRecording(null);
      const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      try {
        const { blob: posterBlob, duration } = await videoPoster(url, 0.5);
        const take = {
          id: uid(),
          kind: "video",
          title: source === "vhs" ? `Cinta VHS ${takes.length + 1}` : source === "pip" ? `Directo ${takes.length + 1}` : `Toma ${takes.length + 1}`,
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
    const srcEl = source === "pip" ? pipCanvasRef.current : previewRef.current;
    const w = source === "pip" ? srcEl?.width : srcEl?.videoWidth;
    const h = source === "pip" ? srcEl?.height : srcEl?.videoHeight;
    if (!srcEl || !w || !h) return toast("Activa primero la cámara o captura", "error");
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (source !== "pip") {
      ctx.filter = filter === "vhs" ? "sepia(.3) contrast(1.15) saturate(1.15)" : filter === "warm" ? "sepia(.35) saturate(1.25) contrast(1.05)" : "none";
    }
    ctx.drawImage(srcEl, 0, 0);
    c.toBlob(
      async (blob) => {
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
      },
      "image/jpeg",
      0.9
    );
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
    const movie = newMovie(source === "vhs" ? "Mi cinta VHS digitalizada" : "Mi película casera");
    movie.kicker = source === "vhs" ? "Captura VHS Analógica" : "Producción propia";
    movie.subtitle = source === "vhs" ? "Digitalizada desde reproductor VHS" : "Grabada con el Estudio DVD Retro";
    let acc = 0;
    movie.chapters = takes.map((t) => {
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
  useEffect(() => {
    if (!previewTake || previewTake.kind !== "video") return setTakeUrl(null);
    resolveSrc({ mediaId: previewTake.mediaId }).then(setTakeUrl);
  }, [previewTake]);

  return (
    <main className="studio-layout">
      <section style={{ minWidth: 0 }}>
        {/* Selector de modo de fuente */}
        <div className="row wrap" style={{ justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <button data-nav className="chip" data-on={source === "camera"} disabled={!!recording} onClick={() => enableDevices("camera")}>
              <Camera style={{ width: 14, height: 14, verticalAlign: -2 }} /> Cámara
            </button>
            <button data-nav className="chip" data-on={source === "screen"} disabled={!!recording} onClick={() => enableDevices("screen")}>
              <Monitor style={{ width: 14, height: 14, verticalAlign: -2 }} /> Pantalla
            </button>
            <button data-nav className="chip" data-on={source === "pip"} disabled={!!recording} onClick={() => enableDevices("pip")}>
              <PictureInPicture2 style={{ width: 14, height: 14, verticalAlign: -2 }} /> Pantalla + Cámara
            </button>
            <button data-nav className="chip" data-on={source === "vhs"} disabled={!!recording} onClick={() => enableDevices("vhs")}>
              <Disc style={{ width: 14, height: 14, verticalAlign: -2 }} /> Captura VHS
            </button>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
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

        {/* Barra de selección de cámara / audio / opciones según modo */}
        <div className="panel row wrap" style={{ padding: "10px 12px", marginBottom: 12, gap: 8, borderRadius: 14 }}>
          {(source === "camera" || source === "pip") && (
            <button
              data-nav
              type="button"
              className="chip"
              disabled={!!recording || busy}
              onClick={toggleFacing}
              style={{ padding: "6px 12px", fontSize: 12 }}
              title="Alternar entre cámara trasera y frontal"
            >
              <RefreshCw style={{ width: 13, height: 13, verticalAlign: -2 }} /> {facing === "environment" ? "Cámara: Trasera" : "Cámara: Frontal"}
            </button>
          )}
          {source !== "screen" && (
            <select
              aria-label={source === "vhs" ? "Capturadora de vídeo" : "Seleccionar cámara"}
              className="field"
              style={{ width: "auto", minWidth: 160, flex: "1 1 170px", padding: "6px 10px", fontSize: 12 }}
              disabled={!!recording}
              value={selectedCamId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedCamId(id);
                if (devicesOn) enableDevices(source, { camId: id, autoMonitor: false });
              }}
            >
              <option value="">{source === "vhs" ? "Capturadora USB (Auto)" : "Cámara (Auto)"}</option>
              {cameras.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId}>
                  {c.label || `Cámara ${i + 1}`}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label={source === "vhs" ? "Entrada de audio VHS" : "Seleccionar micrófono"}
            className="field"
            style={{ width: "auto", minWidth: 160, flex: "1 1 170px", padding: "6px 10px", fontSize: 12 }}
            disabled={!!recording}
            value={selectedMicId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedMicId(id);
              if (devicesOn) enableDevices(source, { micId: id, autoMonitor: false });
            }}
          >
            <option value="">{source === "vhs" ? "Audio VHS / Línea (Auto)" : "Micrófono (Auto)"}</option>
            {mics.map((m, i) => (
              <option key={m.deviceId || i} value={m.deviceId}>
                {m.label || `Audio ${i + 1}`}
              </option>
            ))}
          </select>

          {source === "pip" && (
            <select
              aria-label="Posición de cámara"
              className="field"
              style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
              value={pipCorner}
              onChange={(e) => setPipCorner(e.target.value)}
            >
              <option value="br">Cámara: Inf. derecha</option>
              <option value="bl">Cámara: Inf. izquierda</option>
              <option value="tr">Cámara: Sup. derecha</option>
              <option value="tl">Cámara: Sup. izquierda</option>
            </select>
          )}

          {source === "vhs" && (
            <button
              data-nav
              type="button"
              className="chip"
              data-on={aspect === "4/3"}
              onClick={() => setAspect((a) => (a === "4/3" ? "16/9" : "4/3"))}
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              Formato {aspect === "4/3" ? "4:3 VHS" : "16:9"}
            </button>
          )}

          <button
            data-nav
            type="button"
            className="chip"
            data-on={monitorOn}
            onClick={() => setMonitorOn((v) => !v)}
            style={{ padding: "6px 12px", fontSize: 12 }}
            title="Escuchar la entrada de audio en directo por tus altavoces o auriculares"
          >
            {monitorOn ? <Volume2 style={{ width: 13, height: 13, verticalAlign: -2 }} /> : <VolumeX style={{ width: 13, height: 13, verticalAlign: -2 }} />}{" "}
            {monitorOn ? "Escucha activa" : "Escucha mutada"}
          </button>
        </div>

        {source === "vhs" && (
          <p className="text-muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
            Conecta tu reproductor VHS al ordenador con una capturadora USB (RCA/Euroconector → USB), selecciona la capturadora en vídeo y su entrada USB en audio, pulsa Play en el VHS y graba sin filtros de voz.
          </p>
        )}

        {/* Vista previa */}
        <div className="record-preview" style={{ aspectRatio: aspect === "4/3" ? "4 / 3" : "16 / 9" }}>
          {previewTake ? (
            previewTake.kind === "photo" ? (
              <Thumb src={{ mediaId: previewTake.mediaId }} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <video ref={takeVideoRef} src={takeUrl} autoPlay muted={false} controls style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            )
          ) : (
            <>
              <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                className={source === "pip" ? "" : `record-filter-${filter}`}
                style={
                  source === "pip"
                    ? { position: "fixed", left: -9999, top: 0, width: 2, height: 2, opacity: 0.01 }
                    : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: source === "screen" || source === "vhs" ? "contain" : "cover" }
                }
              />
              <video
                ref={pipCamRef}
                autoPlay
                muted
                playsInline
                style={{ position: "fixed", left: -9999, top: 0, width: 2, height: 2, opacity: 0.01 }}
              />
              {source === "pip" && (
                <canvas
                  ref={pipCanvasRef}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                />
              )}
            </>
          )}
          <div className="record-grid-overlay" aria-hidden />
          {recording && (
            <span className="row" style={{ position: "absolute", left: 12, top: 12, background: "rgba(5,7,13,.75)", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
              <span className="rec-dot" /> GRABANDO {recording.kind === "video" ? (source === "vhs" ? "VHS" : source === "pip" ? "DIRECTO" : "VÍDEO") : "VOZ EN OFF"}
            </span>
          )}
          {!devicesOn && !previewTake && (
            <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(5,7,13,.6)" }}>
              <div>
                {source === "vhs" ? (
                  <Disc style={{ width: 40, height: 40, color: "var(--gold)" }} />
                ) : source === "pip" ? (
                  <PictureInPicture2 style={{ width: 40, height: 40, color: "var(--gold)" }} />
                ) : (
                  <Camera style={{ width: 40, height: 40, color: "var(--gold)" }} />
                )}
                <p>
                  {source === "vhs"
                    ? "Conecta tu capturadora VHS USB y pulsa el botón dorado para previsualizar"
                    : source === "pip"
                      ? "Activa Pantalla + Cámara frontal para grabar tu directo"
                      : "Activa la cámara para empezar a grabar"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
          {!devicesOn ? (
            <Control data-nav className="btn-gold btn-lg" onClick={() => enableDevices(source)} disabled={busy}>
              {source === "screen" ? (
                <>
                  <Monitor /> Compartir pantalla y micrófono
                </>
              ) : source === "pip" ? (
                <>
                  <PictureInPicture2 /> Activar Pantalla + Cámara
                </>
              ) : source === "vhs" ? (
                <>
                  <Disc /> Activar Captura VHS
                </>
              ) : (
                <>
                  <Camera /> Activar cámara y micrófono
                </>
              )}
            </Control>
          ) : recording?.kind === "video" ? (
            <Control data-nav className="btn-danger btn-lg" onClick={() => recording.recorder.stop()}>
              <Square /> Detener toma
            </Control>
          ) : (
            <Control data-nav className="btn-gold btn-lg" onClick={startVideoTake}>
              <Video /> {source === "vhs" ? "Grabar cinta VHS" : source === "pip" ? "Grabar directo" : "Grabar toma de vídeo"}
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
              Volver al directo
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
            {takes.length === 0 && <p className="text-muted" style={{ margin: 0 }}>Aún no hay tomas. Graba vídeo, digitaliza VHS, haz fotos y añade voces en off.</p>}
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
            Voz/VHS, voz en off/pantalla y música por separado. La mezcla se graba con el vídeo.
          </p>
          <div className="mixer">
            <ChannelStrip id="voice" name={source === "vhs" ? "Audio VHS" : "Voz"} icon={<Mic />} mix={mix} levelRef={levelRefs} onVol={setVol} onMute={toggleMute} onSolo={toggleSolo} />
            <ChannelStrip id="voiceover" name={source === "screen" || source === "pip" ? "Pantalla" : "Voz en off"} icon={<Play />} mix={mix} levelRef={levelRefs} onVol={setVol} onMute={toggleMute} onSolo={toggleSolo} />
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
