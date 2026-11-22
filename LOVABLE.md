# DVD Retro Studio — contexto para Lovable (y para cualquier IA)

> Si eres Lovable (o cualquier asistente de código) leyendo este repositorio: este archivo
> resume qué es la app, cómo está construida y qué reglas debes respetar al continuar el trabajo.
> La app ya funciona; tu tarea es **mejorarla sin romperla**.

## Qué es

**DVD Retro Studio** — una biblioteca de películas estilo DVD, **100% local** (sin backend,
sin cuentas, sin créditos). El usuario guarda películas, capítulos con nombre, pases de fotos
y grabaciones en su propio dispositivo (IndexedDB), los remasteriza con un shader WebGL propio,
y comparte con otros usuarios mediante **archivos estándar** (MP4/WebM/JPG/MP3/ZIP), no formatos
propietarios. Debe funcionar en móvil, tablet, ordenador y TV (modo 10-foot con navegación por mando).

## Stack

- **React 19 + Vite 8** (JSX, sin TypeScript), CSS propio en `src/styles.css` (sin Tailwind).
- Dependencias: `lucide-react` (iconos), `qrcode` (QR). Nada más.
- Router por hash (`#/biblioteca`, `#/editor/:id`, …) — funciona en cualquier hosting estático.
- Arranque: `npm run dev` (puerto 5173). Build: `npm run build` → `dist/`.

## Arquitectura de archivos

```
src/
  main.jsx            → monta <App/>
  App.jsx             → router por hash, estado global (película actual, modo TV, apariencia),
                        navegación espacial para mando TV (flechas), overlay de "seed"
  styles.css          → todo el tema (azul noche + dorado + cian), responsive y modo TV
  components.jsx      → Control, Header, Thumb, RangeRow, RemasterPanel, RemasterView (WebGL),
                        ShareModal (enlace/QR + descargas), Toasts
  lib/
    db.js             → IndexedDB (películas, pases, blobs de medios, meta) + CRUD reactivo
    types.js          → constantes y factorías (newMovie, newSlideshow, FREE_TRACKS…)
    media.js          → hooks useSrc/useMovies/useMovie…, fmtTime, videoPoster, toasts
    bundle.js         → SOLO importación legacy de .dvd antiguos (ya no se exporta .dvd)
    zip.js            → ZIP mínimo STORED (escritura/lectura) + CRC32, sin dependencias
    exporter.js       → descargas estándar: vídeo directo, render de película/pase a WebM,
                        biblioteca → ZIP con archivos + biblioteca.json, e importación ZIP
    audio.js          → consola multipista WebAudio (voz / voz en off / música, faders, M/S, medidores)
    music.js          → 3 pistas libres de derechos generadas en vivo con WebAudio
    seed.js           → contenido demo generado en el primer arranque (vídeo Canvas + pósters)
  views/
    Home.jsx          → menú DVD (portada, capítulos, remaster)
    Biblioteca.jsx    → grid de películas/pases, subir vídeo, importar ZIP
    Player.jsx        → reproductor con capítulos, remaster y voz en off sincronizada
    Editor.jsx        → editor de capítulos/clips, cortes, voz en off, remaster, descargas
    Slideshow.jsx     → creador y reproductor de pases de fotos con música
    Studio.jsx        → grabación con cámara + consola multipista → crea película
    SharedDisc.jsx    → enlace #/d/CÓDIGO (abre disco importado o pide los archivos)
```

## Modelo de datos (IndexedDB, base `dvd-retro-studio`)

- **Movie**: `{ id, kind:"movie", title, kicker, subtitle, cover:Src, video?:Src, duration,
  chapters:[{ id, title, start, poster:Src, clip?:Src, clipDuration?, voiceOver?:Src }],
  remaster:{sharp,denoise,color,vhs}, remasterOn, photos:Src[], linkedSlideshows:[],
  shareCode, createdAt }`
- **Slideshow**: `{ id, kind:"slideshow", title, photos:Src[], seconds, transition:"fade"|"wipe"|"iris",
  music:{kind:"free",trackId}|{kind:"own",mediaId,name}|{kind:"none"}, shareCode, createdAt }`
- **Src** = `{ url?: string, mediaId?: string }` (URL externa o blob local).
- **MediaRecord** = `{ id, blob, type, name? }` — los bytes reales viven aquí.

## Reglas importantes (no romper)

1. **Todo local**: nada de servidores, APIs ni cuentas. Si añades algo externo, que sea opcional.
2. **Sin créditos**: la remasterización es un shader WebGL local (`RemasterView` en components.jsx).
3. **Archivos estándar**: la exportación es MP4/WebM/JPG/MP3/ZIP. El `.dvd` solo se importa por
   compatibilidad (`bundle.js`); no vuelvas a exportarlo.
4. **ZIP sin compresión**: `zip.js` escribe/lee entradas STORED (los medios ya están comprimidos).
   No introduzcas librerías de ZIP salvo que sea imprescindible.
5. **Router por hash**: no cambies a rutas de servidor; el enlace compartido es `#/d/CÓDIGO`.
6. **Modo TV**: todo control interactivo lleva `data-nav`; la navegación espacial vive en `App.jsx`.
7. **Idioma de la UI**: español.
8. **Sin TypeScript**: el proyecto es JSX. Mantén el estilo actual (CSS propio, sin Tailwind).

## Estado actual (funciona)

- Menú DVD, biblioteca, reproductor con capítulos y voz en off, editor completo (clips, cortes,
  voz en off, remaster), pases de fotos con música libre/propia, estudio con cámara y consola
  multipista, compartir por enlace/QR + descargas estándar + ZIP, modo TV, 3 apariencias.
- Contenido demo automático en el primer arranque (`seed.js`, flag `meta.seeded`).

## Ideas de mejora (sugeridas, no obligatorias)

- Subtítulos por capítulo (WebVTT) y pista de subtítulos en el reproductor.
- Exportación MP4 (H.264) vía WebCodecs cuando el navegador lo soporte, para máxima
  compatibilidad con TV.
- Miniaturas de vídeo en la biblioteca generadas al subir (ya existe `videoPoster`).
- Modo "cine" en TV: reproducción automática del siguiente capítulo con OSD.
- Importación masiva de fotos desde una carpeta (File System Access API) para pases.
- Persistencia de la posición de reproducción por película.

## Comandos

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # dist/ listo para publicar
```
