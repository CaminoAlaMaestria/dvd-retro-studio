# Reglas de colaboración (Arena ⇄ Lovable)

1. `main` siempre debe compilar (`npm run build` en verde).
2. Trabaja en ramas: `lovable/<tema>` o `arena/<tema>`; fusiona con PR cuando esté probado.
3. Mensajes de commit claros en español, ej.: `[lovable] Añade subtítulos al reproductor`.
4. Al terminar cada sesión, actualiza `HANDOFF.md` (qué cambió + qué se probó + siguiente paso).
5. No cambies el stack (React 19 + Vite + JSX + CSS propio) ni reescribas la app sin acordarlo (lee `LOVABLE.md`).
6. Todo 100 % local: nada de backend, cuentas ni servicios externos obligatorios.
7. Exportación solo con archivos estándar (MP4/WebM/JPG/MP3/ZIP). **No reintroducir `.dvd` al exportar**.
8. UI en español. Router por hash (`#/...`). Controles con `data-nav` (modo TV).
9. Si una IA necesita que la otra revise algo, lo deja anotado en `HANDOFF.md`.
