import heroImg from "../assets/hero-balconies.jpg";
import womanImg from "../assets/scene-woman.jpg";
import balconyImg from "../assets/scene-balcony.jpg";
import manImg from "../assets/scene-man.jpg";
import reelsImg from "../assets/scene-reels.jpg";
import copperImg from "../assets/copper-blocks.jpg";
import pinkImg from "../assets/pink-balconies.jpg";
import woodImg from "../assets/wood-corner.jpg";
import whiteImg from "../assets/white-curved.jpg";
import blackImg from "../assets/black-facade.jpg";
import wovenImg from "../assets/facade-woven.jpg";
import steelImg from "../assets/steel-roofs.jpg";
import wavyImg from "../assets/wavy-roof.jpg";
import { getMeta, listMovies, putMedia, saveMovie, saveSlideshow, setMeta, uid } from "./db.js";
import { DEFAULT_REMASTER, newMovie, newSlideshow } from "./types.js";

/* ============================================================
   Contenido de demostración inicial:
   combina fotos reales de estudio/arquitectura + un vídeo corto
   generado en Canvas para que la biblioteca sea jugable y
   reproducible desde el segundo cero.
   ============================================================ */

function recordDemoVideo(seconds = 6) {
  return new Promise((resolve, reject) => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    const x = c.getContext("2d");
    const stream = c.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    rec.onerror = () => reject(new Error("No se pudo generar el vídeo de demostración"));
    const t0 = performance.now();
    const scenes = [
      { from: 0, to: 1.5, title: "EL COMIENZO", sub: "Escena 01 · Edición Familiar" },
      { from: 1.5, to: 3.0, title: "VERANO EN LA COSTA", sub: "Escena 02 · DVD Retro Studio" },
      { from: 3.0, to: 4.5, title: "LA MUDANZA", sub: "Escena 03 · Remasterizado" },
      { from: 4.5, to: 6.0, title: "CINE EN CASA", sub: "Escena 04 · 100 % local" },
    ];
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= seconds) {
        rec.stop();
        return;
      }
      const hue = (t * 24) % 360;
      const g = x.createLinearGradient(0, 0, 640, 360);
      g.addColorStop(0, `hsl(${hue} 50% 10%)`);
      g.addColorStop(1, `hsl(${(hue + 70) % 360} 55% 22%)`);
      x.fillStyle = g;
      x.fillRect(0, 0, 640, 360);
      x.save();
      x.translate(320, 145);
      x.rotate(t * 1.4);
      x.beginPath();
      x.arc(0, 0, 60, 0, Math.PI * 2);
      x.fillStyle = "#cfd8e6";
      x.fill();
      x.beginPath();
      x.arc(0, 0, 15, 0, Math.PI * 2);
      x.fillStyle = "#0a0e1a";
      x.fill();
      x.strokeStyle = "rgba(90,110,150,.6)";
      x.lineWidth = 2;
      [28, 42].forEach((r) => {
        x.beginPath();
        x.arc(0, 0, r, 0, Math.PI * 2);
        x.stroke();
      });
      x.restore();
      const sc = scenes.find((s) => t >= s.from && t < s.to) || scenes[0];
      x.fillStyle = "rgba(233,238,247,.96)";
      x.font = "bold 32px Georgia, serif";
      x.textAlign = "center";
      x.fillText(sc.title, 320, 264);
      x.fillStyle = "rgba(227,193,92,.95)";
      x.font = "17px system-ui, sans-serif";
      x.fillText(sc.sub, 320, 294);
      x.fillStyle = "rgba(233,238,247,.5)";
      x.font = "13px monospace";
      x.fillText(`00:0${Math.floor(t)} / 00:06`, 320, 334);
      requestAnimationFrame(draw);
    };
    rec.start();
    draw();
  });
}

export async function seedIfNeeded(onProgress) {
  if (await getMeta("seeded")) return;
  try {
    if ((await listMovies()).length) {
      await setMeta("seeded", true);
      onProgress?.(null);
      return;
    }

    onProgress?.("Creando tu primera película…");
    const videoBlob = await recordDemoVideo(6);
    const videoId = await putMedia(videoBlob, "demo.webm");

    onProgress?.("Creando pase de fotos de ejemplo…");
    const show = newSlideshow("Paseo de Arquitectura");
    show.photos = [copperImg, pinkImg, woodImg, whiteImg, blackImg, wovenImg, steelImg, wavyImg].map((url) => ({ url }));
    show.seconds = 4.5;
    show.transition = "fade";
    show.music = { kind: "free", trackId: "amanecer" };
    await saveSlideshow(show);

    const movie = newMovie("Vol. 1: Memorias");
    movie.kicker = "Edición Familiar · Disco 1";
    movie.subtitle = "Verano en Lisboa · 2024";
    movie.cover = { url: heroImg };
    movie.video = { mediaId: videoId };
    movie.duration = 6;
    movie.chapters = [
      { id: uid(), title: "Escena 01: El Comienzo", start: 0, poster: { url: womanImg } },
      { id: uid(), title: "Escena 02: Verano en la Costa", start: 1.5, poster: { url: balconyImg } },
      { id: uid(), title: "Escena 03: La Mudanza", start: 3.0, poster: { url: manImg } },
      { id: uid(), title: "Escena 04: Cine en Casa", start: 4.5, poster: { url: reelsImg } },
    ];
    movie.remaster = { ...DEFAULT_REMASTER };
    movie.remasterOn = true;
    movie.linkedSlideshows = [show.id];
    await saveMovie(movie);

    await setMeta("seeded", true);
    onProgress?.(null);
  } catch (e) {
    console.warn("No se pudo crear el contenido de demostración", e);
    await setMeta("seeded", true);
    onProgress?.(null);
  }
}
