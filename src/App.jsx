import { useCallback, useEffect, useState } from "react";
import { Header, ShareModal, Toasts, moveFocus } from "./components.jsx";
import { useMovies, useSlideshows } from "./lib/media.js";
import { seedIfNeeded } from "./lib/seed.js";
import { Home } from "./views/Home.jsx";
import { Biblioteca } from "./views/Biblioteca.jsx";
import { Player } from "./views/Player.jsx";
import { Editor } from "./views/Editor.jsx";
import { SlideshowCreator, SlideshowPlayer } from "./views/Slideshow.jsx";
import { Studio } from "./views/Studio.jsx";
import { SharedDisc } from "./views/SharedDisc.jsx";

/* ---------- router por hash (funciona en cualquier servidor estático) ---------- */
function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  const seg = path.split("/").filter(Boolean);
  if (seg.length === 0) return { name: "home" };
  if (seg[0] === "biblioteca") return { name: "biblioteca" };
  if (seg[0] === "estudio") return { name: "estudio" };
  if (seg[0] === "editor" && seg[1]) return { name: "editor", id: seg[1] };
  if (seg[0] === "repro" && seg[1]) return { name: "repro", id: seg[1], cap: Number(params.get("cap") || 0) };
  if (seg[0] === "pase" && seg[1]) return { name: "pase", id: seg[1] };
  if (seg[0] === "pases" && seg[1] === "nuevo") return { name: "pase-nuevo" };
  if (seg[0] === "pases" && seg[1] === "editar" && seg[2]) return { name: "pase-editar", id: seg[2] };
  if (seg[0] === "d" && seg[1]) return { name: "d", code: seg[1] };
  return { name: "home" };
}

const navigate = (hash) => {
  window.location.hash = hash;
};

/* ---------- navegación espacial para mando de TV / teclado ---------- */
function spatialNav(e) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
  if (moveFocus(e.key)) e.preventDefault();
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const movies = useMovies() ?? [];
  const slideshows = useSlideshows() ?? [];
  const [currentId, setCurrentId] = useState(() => localStorage.getItem("dvd-current") || "");
  const [tv, setTv] = useState(() => localStorage.getItem("dvd-tv") === "1");
  const [look, setLook] = useState(() => localStorage.getItem("dvd-look") || "classic");
  const [share, setShare] = useState(null); // { movieId, slideshowId, initial }
  const [seedMsg, setSeedMsg] = useState(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    seedIfNeeded(setSeedMsg);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("tv", tv);
    localStorage.setItem("dvd-tv", tv ? "1" : "0");
  }, [tv]);

  useEffect(() => {
    localStorage.setItem("dvd-look", look);
  }, [look]);

  useEffect(() => {
    localStorage.setItem("dvd-current", currentId);
  }, [currentId]);

  useEffect(() => {
    document.addEventListener("keydown", spatialNav);
    return () => document.removeEventListener("keydown", spatialNav);
  }, []);

  const openMovie = useCallback((id) => {
    setCurrentId(id);
    navigate("#/");
  }, []);

  const openShare = useCallback((movieId = null, slideshowId = null, initial = "movie") => {
    setShare({ movieId, slideshowId, initial });
  }, []);

  const headerRoute = route.name === "pase-nuevo" || route.name === "pase-editar" ? "pase-nuevo" : route.name;

  return (
    <>
      <Header route={headerRoute} onNavigate={navigate} tv={tv} onToggleTv={() => setTv((v) => !v)} look={look} onLook={setLook} />
      {route.name === "home" && (
        <Home
          movies={movies}
          slideshows={slideshows}
          currentId={currentId}
          onSelect={setCurrentId}
          navigate={navigate}
          onShare={(id) => openShare(id, null, "movie")}
          look={look}
          tv={tv}
          onToggleTv={() => setTv((v) => !v)}
        />
      )}
      {route.name === "biblioteca" && <Biblioteca movies={movies} slideshows={slideshows} navigate={navigate} onShare={openShare} onOpenMovie={openMovie} />}
      {route.name === "repro" && <Player movieId={route.id} capIndex={route.cap} navigate={navigate} onShare={(id) => openShare(id, null, "movie")} />}
      {route.name === "editor" && <Editor movieId={route.id} navigate={navigate} onShare={(id) => openShare(id, null, "movie")} />}
      {route.name === "pase" && <SlideshowPlayer slideshowId={route.id} navigate={navigate} onShare={(m, s) => openShare(m, s, "slideshow")} />}
      {route.name === "pase-nuevo" && <SlideshowCreator navigate={navigate} onShare={openShare} />}
      {route.name === "pase-editar" && <SlideshowCreator slideshowId={route.id} navigate={navigate} onShare={openShare} />}
      {route.name === "estudio" && <Studio navigate={navigate} />}
      {route.name === "d" && <SharedDisc code={route.code} movies={movies} slideshows={slideshows} navigate={navigate} onOpenMovie={openMovie} />}

      {share && <ShareModal open onClose={() => setShare(null)} movieId={share.movieId} slideshowId={share.slideshowId} initial={share.initial} />}
      <Toasts />

      {seedMsg && (
        <div className="modal-backdrop" style={{ zIndex: 90 }}>
          <div className="panel" style={{ padding: 28, textAlign: "center", maxWidth: 380 }}>
            <div className="logo" style={{ justifyContent: "center", marginBottom: 12 }}>
              <span className="disc" aria-hidden />
            </div>
            <p className="font-display text-gold" style={{ fontSize: 20, margin: "0 0 6px" }}>
              Preparando tu discoteca…
            </p>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              {seedMsg}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
