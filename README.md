# DVD Retro Studio

[![build](https://github.com/USUARIO/dvd-retro-studio/actions/workflows/build.yml/badge.svg)](https://github.com/USUARIO/dvd-retro-studio/actions/workflows/build.yml)

Tu biblioteca de películas estilo DVD, **100% local**: sin cuentas, sin servidores y sin créditos.
Todo vive en tu dispositivo (IndexedDB) y la app es un único proyecto integrado.

> Documentación para colaboradores/IAs: [`LOVABLE.md`](./LOVABLE.md) · [`HANDOFF.md`](./HANDOFF.md) · [`COLLAB.md`](./COLLAB.md)

## Qué incluye

- **Menú DVD** — portada estilo reproductor de DVD con película actual, capítulos con nombre, **Galería & Fotos** y remasterización en directo.
- **Biblioteca** — películas y pases de fotos guardados en el dispositivo, con buscador, filtros y control de espacio usado.
- **Editor de vídeo y capítulos** — añade/renombra/reordena capítulos, sube clips de escenas, exporta cortes como películas nuevas y graba **voz en off** por capítulo.
- **Remasterización sin créditos** — shader WebGL propio (nitidez, quita-ruido, color y filtro VHS/CRT) con comparador original/remasterizado.
- **Pases de fotos** — crea y **edita pases existentes** con efecto Ken Burns, transiciones (fundido, barrido, iris) y música **propia o libre de derechos** (3 pistas originales generadas en el dispositivo).
- **Estudio de grabación** — **cámara o pantalla**, fotos, filtros en vivo y **consola multipista** con canales separados de *voz*, *voz en off* y *música* (faders, silencio/solo, medidores y **ducking automático**).
- **Compartir con otros usuarios** — cero formatos propietarios: descarga la película como **vídeo estándar (MP4/WebM)**, exporta para **USB / TV (MP4 con capítulos reales + `.srt`)**, genera un **reproductor autónomo `.html`** (un archivo offline con doble clic), convierte pases en vídeo o lleva toda la biblioteca en un **ZIP con archivos normales** (`biblioteca.json` + MP4/JPG/MP3…). También incluye enlace + QR.
- **Adaptable a todo + PWA instalable** — móvil, tablet, ordenador y **modo TV (10-foot UI)** con navegación por flechas y mando virtual en pantalla. Tres apariencias: Clásico, Y2K y Moderno.

## Cómo ejecutarla

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # versión lista para publicar (carpeta dist/)
npm run preview  # previsualizar la versión de producción
```

## Privacidad

Ningún archivo sale de tu dispositivo. Los enlaces/QR solo abren discos ya importados;
para llevar tus películas a otro dispositivo, usa el vídeo descargado o el paquete ZIP.

## Notas sobre los vídeos generados

Los navegadores generan vídeo en formato **WebM**, que se reproduce en ordenadores, móviles
y la mayoría de televisores modernos. Si tu TV no acepta WebM, usa el **paquete ZIP**: contiene
los archivos originales (normalmente MP4) tal cual, listos para cualquier pantalla.
