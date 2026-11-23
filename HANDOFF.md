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

- **(Arena — Google Play Store PWA/TWA + Responsive Móvil/Tablet/TV/PC)**:
  - Añadido `public/sw.js` (Service Worker offline-first) registrado en `src/main.jsx`.
  - Actualizado `public/manifest.webmanifest` con iconos separados `any` y `maskable` (`public/icon-maskable-512.png`), capturas (`public/screenshots/wide.png` y `narrow.png`), `id`, `scope`, `orientation: "any"` y `categories`.
  - Añadidos `public/privacidad.html`, `public/.well-known/assetlinks.json` y guía `PLAYSTORE.md`.
  - Mejorado `index.html` (`viewport-fit=cover`, meta tags móvil/Apple PWA).
  - Corregido el redimensionamiento en `src/styles.css`, `src/components.jsx`, `src/views/Editor.jsx` y `src/views/Studio.jsx`: cabecera en 2 filas sin desbordamiento bajo 860 px, áreas seguras (`safe-area-inset-*`), `touch-action: none` en faders/rangos, orden del editor en móvil/tablet (vídeo primero), `.two-col` adaptable, Modo TV (10-foot UI) ampliado y guardas de `getDisplayMedia`/`MediaRecorder` para Android WebView.

## Siguiente paso sugerido

- Subtítulos manuales editables por capítulo en el Editor o selector de calidad/resolución (720p/1080p) en la exportación para TV.
