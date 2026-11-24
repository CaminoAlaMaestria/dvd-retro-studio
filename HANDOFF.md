# HANDOFF — Traspaso entre IAs (Arena ⇄ Lovable)

> Cada IA que trabaje en el repo debe actualizar este archivo al terminar:
> qué cambió, qué probó y cuál es el siguiente paso sugerido.

## Estado actual (2026-11-22)

- **Versión oficial unificada**: fusión de lo mejor de las 3 versiones sobre `dvd-studio` (React 19 + Vite 8 + JSX + CSS propio, 100 % local).
- Funciones completas:
  - Menú DVD (Clásico / Y2K / Moderno) + **Galería & Fotos** en portada + demo inicial con fotos reales (`src/assets/*.jpg`) y vídeo reproducible.
  - Biblioteca IndexedDB con buscador, filtros y medidor de uso.
  - Editor: capítulos, clips de escenas con tiempos acumulados, cortes y **voz en off por capítulo**.
  - Remasterización WebGL sin créditos con comparativa antes/después.
  - Estudio multipista: **Cámara / Pantalla**, captura de fotos, filtros en vivo (Limpio / VHS 2004 / Cine 35mm), tomas, **consola de 3 pistas** (*Voz*, *Voz en off*, *Música* con faders, Solo/Mute, vúmetros y **ducking automático**).
  - Pases de fotos: creación, **edición de pases existentes**, Ken Burns, transiciones, música libre/propia y renderizado a vídeo.
  - Exportación **sin `.dvd`** (solo archivos estándar): descarga directa MP4/WebM, **vídeo para USB/TV (MP4 H.264 con capítulos `chpl` + `.srt`)**, **reproductor autónomo `.html`** y **paquete ZIP** (`biblioteca.json` + archivos originales). El `.dvd` solo se importa (legacy).
  - Modo TV (10-foot UI) con navegación espacial + **mando virtual en pantalla (`Remote`)** + **PWA instalable**.

## Última sesión

- **(Arena — Mejoras en Estudio: selector de cámaras, Pantalla + Cámara PiP y Captura VHS analógica)**:
  - `src/views/Studio.jsx`: selector completo de cámara (botón rápido **Trasera / Frontal** + lista de cámaras/capturadoras `enumerateDevices()`), selector de micrófono/entrada de línea, modo **Pantalla + Cámara (PiP)** en vivo con compositor `<canvas>` y esquina configurable para directos, y modo **Captura VHS** para digitalizar cintas desde capturadoras USB con audio limpio sin filtros de voz (`echoCancellation/noiseSuppression/autoGainControl: false`), formato 4:3/16:9 y escucha en directo (`setMonitor`).
  - `src/lib/audio.js`: añadido `setMonitor(on)` y `replaceStreamSource(stream, channelId)` para cambiar entradas de micro/VHS y conectar audio de pantalla al canal secundario sin fugas ni acoples.
  - `public/terminos.html`: página de Términos del Servicio para Google Play Console. Build en verde.

## Siguiente paso sugerido

- Subtítulos manuales editables por capítulo en el Editor o selector de calidad/resolución (720p/1080p) en la exportación para TV.
