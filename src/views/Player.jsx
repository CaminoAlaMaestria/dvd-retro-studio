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

  const chapters = movie?.chapters ?? [];
  const current = chapters[cap];
  const hasClips = chapters.some((c) => c.clip);

  const src = useSrc(current?.clip ?? movie?.video ?? current?.poster ?? movie?.cover);
  const segDuration = current?.clip ? current.clipDuration ?? 0 : chapterEnd(movie, cap) - (current?.start ?? 0);
  const segStart = current?.clip ? 0 : current?.start ?? 0;

  const goTo = useCallback(
    (i) => {
      if (!movie) return;
      const next = Math.max(0, Math.min(chapters.length - 1, i));
      setCap(next);
      setTime(0);
    },
    [movie, chapters.length]
  );

  /* Al cambiar de capítulo: buscar el inicio y preparar la voz en off. */
  useEffect(() => {
    const v = videoRef.current;
    if (v && current && !current.clip) v.currentTime = current.start ?? 0;
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
      if (current?.voiceOver) {
        resolveSrc(current.voiceOver).then((u) => {
          if (u) {
            a.src = u;
            if (playing) a.play().catch(() => {});
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap, src]);

  const togglePlay = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      a?.pause();
      setPlaying(false);
    } else {
      v.play().catch(() => {});
      if (voiceOn && current?.voiceOver) a?.play().catch(() => {});
      setPlaying(true);
    }
  };

  const onEnded = () => {
    if (cap < chapters.length - 1) goTo(cap + 1);
    else setPlaying(false);
  };

  const onTime = (t, d) => {
    setTime(t);
    if (d) setDur(d);
    const a = audioRef.current;
    if (a && playing && current?.voiceOver && Math.abs(a.currentTime - (t - segStart)) > 0.45) {
      a.currentTime = Math.max(0, t - segStart);
    }
  };

  if (!movie) return <main className="page"><p className="text-muted">Cargando película…</p></main>;

  const progress = segDuration > 0 ? Math.min(100, ((time - segStart) / segDuration) * 100) : 0;

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
          kind={current?.clip || movie.video ? "video" : "image"}
          src={src}
          settings={movie.remaster}
          enabled={movie.remasterOn}
          onTime={onTime}
          onEnded={onEnded}
        />
        <span style={{ position: "absolute", left: 12, top: 12, background: "rgba(5,7,13,.7)", borderRadius: 8, padding: "4px 10px", fontSize: 12 }}>
          {String(cap + 1).padStart(2, "0")} · {current?.title ?? ""}
        </span>
        {movie.remasterOn && (
          <span className="text-cyan" style={{ position: "absolute", right: 12, top: 12, background: "rgba(5,7,13,.7)", borderRadius: 8, padding: "4px 10px", fontSize: 12 }}>
            REMASTERIZADO · 0 CRÉDITOS
          </span>
        )}
        <audio ref={audioRef} preload="auto" />
      </div>

      <div className="player-controls">
        <Control data-nav className="btn-icon" aria-label="Capítulo anterior" onClick={() => goTo(cap - 1)} disabled={cap === 0}>
          <SkipBack />
        </Control>
        <Control data-nav className="btn-gold btn-icon" style={{ width: 52, height: 52 }} aria-label={playing ? "Pausar" : "Reproducir"} onClick={togglePlay}>
          {playing ? <Pause /> : <Play />}
        </Control>
        <Control data-nav className="btn-icon" aria-label="Capítulo siguiente" onClick={() => goTo(cap + 1)} disabled={cap >= chapters.length - 1}>
          <SkipForward />
        </Control>
        <span className="mono text-cyan" style={{ fontSize: 13 }}>
          {fmtTime(Math.max(0, time - segStart))} <span className="text-muted">/ {fmtTime(segDuration)}</span>
        </span>
        <span className="grow" />
        {current?.voiceOver && (
          <Control data-nav className={voiceOn ? "btn-outline-gold" : ""} onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn}>
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
        max={Math.max(0.1, segDuration)}
        step={0.1}
        value={Math.max(0, time - segStart)}
        onChange={(e) => {
          const t = Number(e.target.value);
          setTime(segStart + t);
          if (videoRef.current) videoRef.current.currentTime = segStart + t;
          if (audioRef.current) audioRef.current.currentTime = t;
        }}
      />

      <div className="player-chapters">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            data-nav
            className="chip"
            data-on={i === cap}
            onClick={() => goTo(i)}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Thumb src={c.poster} style={{ width: 40, aspectRatio: "16/9", objectFit: "cover", borderRadius: 4 }} alt="" />
            {i + 1}. {c.title}
          </button>
        ))}
      </div>

      <p className="text-muted" style={{ fontSize: 13 }}>
        {movie.title} · {chapters.length} capítulos · {fmtTime(movie.duration)}
      </p>
    </main>
  );
}

function chapterEnd(movie, i) {
  if (!movie) return 0;
  const next = movie.chapters[i + 1];
  return next ? next.start : movie.duration || movie.chapters[i]?.start || 0;
}
