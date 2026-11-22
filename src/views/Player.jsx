import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic, Pause, Play, Scissors, Share2, SkipBack, SkipForward } from "lucide-react";
import { Control, RemasterView, Thumb } from "../components.jsx";
import { useMovie, useSrc, fmtTime, resolveSrc } from "../lib/media.js";

/** Reproductor estilo DVD: capítulos, remaster y voz en off sincronizada. */
export function Player({ movieId, capIndex = 0, navigate, onShare }) {
  const movie = useMovie(movieId);
  const [cap, setCap] = useState(capIndex);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pendingSeek = useRef(null);

  useEffect(() => {
    setCap(capIndex || 0);
    setPlaying(false);
    setTime(0);
  }, [movieId, capIndex]);

  const chapters = movie?.chapters ?? [];
  const safeCap = chapters.length ? Math.min(cap, chapters.length - 1) : 0;
  const current = chapters[safeCap];
  const hasVideo = !!(current?.clip || movie?.video);

  const src = useSrc(current?.clip ?? movie?.video ?? current?.poster ?? movie?.cover);
  const segStart = current?.clip ? 0 : current?.start ?? 0;
  const segDuration = current?.clip
    ? current.clipDuration ?? dur ?? 0
    : chapters.length
      ? Math.max(0.5, chapterEnd(movie, safeCap) - segStart)
      : dur || movie?.duration || 0;

  const goTo = useCallback(
    (i) => {
      if (!movie || !chapters.length) return;
      const next = Math.max(0, Math.min(chapters.length - 1, i));
      const ch = chapters[next];
      const target = ch?.clip ? 0 : ch?.start ?? 0;
      const srcChanged = !!(ch?.clip || current?.clip);
      setCap(next);
      setTime(target);
      pendingSeek.current = target;
      if (!srcChanged && videoRef.current && videoRef.current.readyState >= 1) {
        videoRef.current.currentTime = target;
        pendingSeek.current = null;
        if (playing) videoRef.current.play().catch(() => {});
      }
    },
    [movie, chapters, current?.clip, playing]
  );

  /* Al cambiar de capítulo o fuente: preparar la voz en off. */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    if (current?.voiceOver) {
      resolveSrc(current.voiceOver).then((u) => {
        if (u) {
          a.src = u;
          if (playing && voiceOn) a.play().catch(() => {});
        }
      });
    } else {
      a.removeAttribute("src");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCap, current?.voiceOver?.mediaId, src]);

  /* Capítulos de solo foto: avanzar automáticamente tras 4 s cuando está en Play. */
  useEffect(() => {
    if (!playing || hasVideo || !chapters.length) return;
    const t0 = performance.now();
    const timer = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      setTime(elapsed);
      if (elapsed >= 4) {
        clearInterval(timer);
        if (safeCap < chapters.length - 1) goTo(safeCap + 1);
        else setPlaying(false);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [playing, hasVideo, safeCap, chapters.length, goTo]);

  const togglePlay = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (playing) {
      v?.pause();
      a?.pause();
      setPlaying(false);
    } else {
      if (hasVideo && v) v.play().catch(() => {});
      if (voiceOn && current?.voiceOver) a?.play().catch(() => {});
      setPlaying(true);
    }
  };

  const onEnded = () => {
    if (safeCap < chapters.length - 1) goTo(safeCap + 1);
    else setPlaying(false);
  };

  const onTime = (t, d) => {
    setTime(t);
    if (d) setDur(d);
    // Si es un único vídeo principal sin clips, sincroniza el capítulo activo con la posición actual
    if (!current?.clip && movie?.video && chapters.length > 1) {
      const idx = chapters.findLastIndex((c) => t + 0.2 >= (c.start ?? 0));
      if (idx >= 0 && idx !== safeCap) setCap(idx);
    }
    const a = audioRef.current;
    if (a && playing && voiceOn && current?.voiceOver && Math.abs(a.currentTime - (t - segStart)) > 0.45) {
      a.currentTime = Math.max(0, t - segStart);
    }
  };

  if (!movie) return <main className="page"><p className="text-muted">Cargando película…</p></main>;

  const localTime = hasVideo ? Math.max(0, time - segStart) : time;
  const maxDur = hasVideo ? segDuration : 4;
  const progress = maxDur > 0 ? Math.min(100, (localTime / maxDur) * 100) : 0;

  return (
    <main className="player-wrap">
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <Control data-nav onClick={() => navigate("#/")}>
          <ArrowLeft /> Menú DVD
        </Control>
        <span className="grow" />
        <Control data-nav className="btn-outline-cyan" onClick={() => navigate(`#/editor/${movie.id}`)}>
          <Scissors /> Editor
        </Control>
        <Control data-nav onClick={() => onShare(movie.id)}>
          <Share2 /> Compartir
        </Control>
      </div>

      <div className="player-screen">
        <RemasterView
          ref={videoRef}
          kind={hasVideo ? "video" : "image"}
          src={src}
          settings={movie.remaster}
          enabled={movie.remasterOn}
          onLoadedMetadata={(el) => {
            const target = pendingSeek.current ?? (!current?.clip ? current?.start ?? 0 : 0);
            if (target > 0) el.currentTime = target;
            pendingSeek.current = null;
            if (playing) el.play().catch(() => {});
          }}
          onTime={onTime}
          onEnded={onEnded}
        />
        <span style={{ position: "absolute", left: 12, top: 12, background: "rgba(5,7,13,.7)", borderRadius: 8, padding: "4px 10px", fontSize: 12 }}>
          {String(safeCap + 1).padStart(2, "0")} · {current?.title ?? movie.title}
        </span>
        {movie.remasterOn && (
          <span className="text-cyan" style={{ position: "absolute", right: 12, top: 12, background: "rgba(5,7,13,.7)", borderRadius: 8, padding: "4px 10px", fontSize: 12 }}>
            REMASTERIZADO · 0 CRÉDITOS
          </span>
        )}
        <audio ref={audioRef} preload="auto" />
      </div>

      <div className="player-controls">
        <Control data-nav className="btn-icon" aria-label="Capítulo anterior" onClick={() => goTo(safeCap - 1)} disabled={safeCap === 0}>
          <SkipBack />
        </Control>
        <Control data-nav className="btn-gold btn-icon" style={{ width: 52, height: 52 }} aria-label={playing ? "Pausar" : "Reproducir"} onClick={togglePlay}>
          {playing ? <Pause /> : <Play />}
        </Control>
        <Control data-nav className="btn-icon" aria-label="Capítulo siguiente" onClick={() => goTo(safeCap + 1)} disabled={safeCap >= chapters.length - 1}>
          <SkipForward />
        </Control>
        <span className="mono text-cyan" style={{ fontSize: 13 }}>
          {fmtTime(localTime)} <span className="text-muted">/ {fmtTime(maxDur)}</span>
        </span>
        <span className="grow" />
        {current?.voiceOver && (
          <Control
            data-nav
            className={voiceOn ? "btn-outline-gold" : ""}
            onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              if (!next) audioRef.current?.pause();
              else if (playing) audioRef.current?.play().catch(() => {});
            }}
            aria-pressed={voiceOn}
          >
            <Mic /> Voz en off {voiceOn ? "✓" : "✕"}
          </Control>
        )}
      </div>

      <input
        data-nav
        aria-label="Progreso"
        type="range"
        className="dvd-range"
        style={{ "--p": `${progress}%` }}
        min={0}
        max={Math.max(0.1, maxDur)}
        step={0.1}
        value={Math.min(localTime, maxDur)}
        onChange={(e) => {
          const t = Number(e.target.value);
          setTime(segStart + t);
          if (videoRef.current && hasVideo) videoRef.current.currentTime = segStart + t;
          if (audioRef.current) audioRef.current.currentTime = t;
        }}
      />

      <div className="player-chapters">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            data-nav
            className="chip"
            data-on={i === safeCap}
            onClick={() => goTo(i)}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Thumb src={c.poster} style={{ width: 40, aspectRatio: "16/9", objectFit: "cover", borderRadius: 4 }} alt="" />
            {i + 1}. {c.title}
          </button>
        ))}
      </div>

      <p className="text-muted" style={{ fontSize: 13 }}>
        {movie.title} · {chapters.length} capítulos · {fmtTime(movie.duration || dur)}
      </p>
    </main>
  );
}

function chapterEnd(movie, i) {
  if (!movie) return 0;
  const next = movie.chapters[i + 1];
  return next ? next.start : movie.duration || movie.chapters[i]?.start || 0;
}
