# PROMPT PARA LOVABLE — Preparar GitHub y colaboración con Arena

> Copia y pega todo este texto como primer mensaje en Lovable, después de importar el proyecto.

---

Actúa como desarrollador senior. Ya tienes importado el proyecto **DVD Retro Studio** (React + Vite, 100% local). Tu primera tarea: **lee el archivo `LOVABLE.md` de la raíz** y respeta todas sus reglas (stack, arquitectura, idioma español, sin backend, sin créditos, archivos estándar, router por hash, modo TV).

## Objetivo

Dejar el proyecto en un repositorio **público** de GitHub, con infraestructura de colaboración para que dos IAs (tú y Arena) podamos trabajar sobre el mismo código sin pisarnos.

## Tareas

### 1. Crear el repositorio y subir el código

- Crea un repositorio **público** en GitHub llamado `dvd-retro-studio`.
- Sube TODO el código del proyecto (incluidos `LOVABLE.md`, `README.md`, `.gitignore`).
- Antes de subir, verifica que `npm install && npm run build` funciona sin errores.
- No subas nunca `node_modules/` ni `dist/`.

### 2. Integración continua mínima

- Crea `.github/workflows/build.yml`: en cada push y pull request, instala dependencias y ejecuta `npm run build`. Si el build falla, el commit no debe darse por bueno.

### 3. Sistema de colaboración entre IAs (muy importante)

Crea estos dos archivos en la raíz:

**`HANDOFF.md`** — diario de traspaso entre IAs. Contenido inicial:

```markdown
# HANDOFF — Traspaso entre IAs (Lovable ⇄ Arena)

> Cada IA que trabaje en el repo debe actualizar este archivo al terminar:
> qué cambió, qué probó y cuál es el siguiente paso sugerido.

## Estado actual (2026-11-21)

- App completa y funcional: menú DVD, biblioteca, editor, pases de fotos,
  estudio multipista, compartir con archivos estándar (MP4/WebM/ZIP), modo TV.
- Exportación: vídeos estándar + ZIP con biblioteca.json. El .dvd solo se importa (legacy).

## Última sesión

- (Lovable) Preparación del repo GitHub + CI. Pendiente: primera mejora a elegir.

## Siguiente paso sugerido

- Subtítulos por capítulo (WebVTT) o exportación MP4 (H.264) vía WebCodecs para TV.
```

**`COLLAB.md`** — reglas de trabajo para ambas IAs:

```markdown
# Reglas de colaboración (Lovable ⇄ Arena)

1. `main` siempre debe compilar (`npm run build` en verde).
2. Trabaja en ramas: `lovable/<tema>` o `arena/<tema>`; fusiona con PR cuando esté probado.
3. Mensajes de commit claros en español, ej.: `[arena] Añade subtítulos al reproductor`.
4. Al terminar cada sesión, actualiza `HANDOFF.md` (qué cambió + siguiente paso).
5. No cambies el stack (React + Vite + JSX + CSS propio) ni la arquitectura sin acordarlo.
6. Todo 100% local: nada de backend, cuentas ni servicios externos obligatorios.
7. Exportación solo con archivos estándar (MP4/WebM/JPG/MP3/ZIP). No reintroducir .dvd.
8. UI en español. Router por hash. Controles con `data-nav` (modo TV).
9. Si una IA necesita que la otra revise algo, lo deja anotado en `HANDOFF.md`.
```

### 4. Documentación del repo

- Actualiza `README.md`: añade el badge de build de GitHub Actions, las instrucciones de instalación y enlaces a `LOVABLE.md` y `HANDOFF.md`.
- Fija la descripción del repo: «Biblioteca DVD 100% local: películas, capítulos, pases de fotos y estudio multipista. Sin servidores ni créditos.»

### 5. Informe final

Al terminar, dime:

- La URL del repositorio.
- Que el CI está en verde.
- Cómo conectar GitHub en Lovable (sincronización) si aún no lo está.

## Flujo de trabajo con la otra IA (Arena)

Arena no tiene conector de GitHub, así que el flujo será:

1. Tú (Lovable) trabajas y haces push al repo público.
2. El usuario me pasa el ZIP del repo (o la URL pública y yo leo los archivos) y yo trabajo aquí.
3. El usuario sube mi ZIP actualizado a GitHub (o te lo pasa a ti para que lo integres).
4. `HANDOFF.md` es el hilo conductor: léelo **siempre** al empezar una sesión y actualízalo al terminar.

No reescribas la aplicación. Solo prepara el repo y la colaboración. Si algo no está claro, pregúntame antes de actuar.

---
