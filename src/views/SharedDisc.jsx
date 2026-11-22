import { useEffect, useRef, useState } from "react";
import { Disc3, Download } from "lucide-react";
import { Control } from "../components.jsx";
import { toast } from "../lib/media.js";
import { importBundle } from "../lib/bundle.js";
import { importLibraryZip } from "../lib/exporter.js";

/** Enlace compartido #/d/CÓDIGO: abre el disco si está importado o pide los archivos. */
export function SharedDisc({ code, movies, slideshows, navigate, onOpenMovie }) {
  const movie = movies?.find((m) => m.shareCode === code);
  const slide = slideshows?.find((s) => s.shareCode === code);
  const ref = useRef(null);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    if (movie) onOpenMovie(movie.id);
    else if (slide) navigate(`#/pase/${slide.id}`);
    else if (code === "DVD-LIB" || imported) navigate("#/biblioteca");
  }, [movie?.id, slide?.id, code, imported, navigate, onOpenMovie]);

  return (
    <main className="page" style={{ maxWidth: 620, textAlign: "center", paddingTop: 80 }}>
      <Disc3 style={{ width: 64, height: 64, color: "var(--gold)", margin: "0 auto" }} />
      <h1 className="font-display text-gold" style={{ fontSize: 30, margin: "18px 0 8px" }}>
        Disco {code}
      </h1>
      <p className="text-muted">
        Este disco no está en este dispositivo. Pide a quien lo compartió el <strong>vídeo (MP4/WebM)</strong>, las fotos o el{" "}
        <strong>paquete ZIP de la biblioteca</strong> e impórtalo aquí para abrirlo.
        Los enlaces no transfieren archivos privados — todo sigue siendo 100% local.
      </p>
      <Control data-nav className="btn-gold btn-lg" onClick={() => ref.current?.click()} style={{ marginTop: 18 }}>
        <Download /> Importar ZIP o archivos
      </Control>
      <div style={{ marginTop: 12 }}>
        <Control data-nav onClick={() => navigate("#/biblioteca")}>
          Ir a la biblioteca
        </Control>
      </div>
      <input
        ref={ref}
        type="file"
        accept=".zip,.dvd,application/zip,application/json"
        className="hidden-file"
        aria-label="Importar disco compartido"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
            if (isZip) await importLibraryZip(file);
            else await importBundle(file);
            setImported(true);
            toast("Disco importado");
          } catch (err) {
            toast(err.message || "No se pudo importar ese disco", "error");
          }
        }}
      />
    </main>
  );
}
