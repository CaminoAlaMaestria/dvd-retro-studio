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

- **(Arena — revisión profunda y arreglos en Editor/Reproductor)**:
  - **Editor (`src/views/Editor.jsx`)**: añadida subida/cambio de **película principal** y **carátula**; selector de **pases vinculados**; botones para reordenar capítulos (↑/↓), añadir escenas desde foto, cambiar foto de capítulo y guardado automático; corregido el bug que reseteaba `time` a `0` al seleccionar capítulos y los botones rotos `downloadVideo`/`downloadZip`.
  - **Reproductor (`src/views/Player.jsx`)**: sincronización del capítulo activo con el tiempo de reproducción, `onLoadedMetadata` seek al cambiar de clip/capítulo, y temporizador automático para capítulos de solo foto.
  - **Biblioteca (`src/views/Biblioteca.jsx`)**: botón «Nueva película» para crear un disco desde cero y abrirlo directo en el Editor.
  - **Exportador / Media / Componentes (`src/lib/exporter.js`, `src/lib/media.js`, `src/components.jsx`)**: `renderMovieVideo` unificado con `exportForTv` (soporta clips, vídeo principal y fotos), `onLoadedMetadata` en `RemasterView` y fallback en `videoPoster`. Build en verde sin advertencias.

## Siguiente paso sugerido

- Subtítulos manuales editables por capítulo en el Editor o selector de calidad/resolución (720p/1080p) en la exportación para TV.
