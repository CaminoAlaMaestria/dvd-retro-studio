# Cómo subir DVD Retro Studio a Google Play Store (sin errores)

La aplicación ya está preparada como **PWA/TWA completa** para empaquetarse como app Android (`.aab`) con **PWABuilder** sin necesidad de programar ni instalar Android Studio.

---

## Qué ya viene resuelto en el proyecto

- **Service Worker real (`public/sw.js`)** registrado automáticamente en producción (`src/main.jsx`) para funcionar también sin conexión.
- **Manifiesto completo (`public/manifest.webmanifest`)** con `id`, `scope`, `orientation: "any"`, iconos separados `any` (`icon-192.png`, `icon-512.png`) y `maskable` (`icon-maskable-512.png` con zona segura del 72 %), y capturas `wide` (`1280×720`) y `narrow` (`720×1280`).
- **Política de privacidad (`public/privacidad.html`)**: página lista en `https://TU-WEB.vercel.app/privacidad.html` exigida por Google Play al usar cámara/micrófono.
- **Digital Asset Links (`public/.well-known/assetlinks.json`)**: archivo listo para quitar la barra de navegador en Android una vez firmes la app.
- **Compatibilidad Android/WebView**:
  - `safe-area-inset-*` para móviles con *notch*, isla dinámica o barra de gestos.
  - Grabación de cámara con respaldo automático de códec (`vp9` → `vp8` → `webm` → `mp4`) y aviso limpio si la grabación de pantalla no está disponible en móvil.
  - Diseño adaptable probado para **Móvil, Tablet, TV (Modo TV 10-foot) y PC**.

---

## Pasos para generar tu `.aab` y subirlo a Google Play

### 1. Sube estos cambios a GitHub y espera a que Vercel publique
En cuanto Vercel termine el despliegue, comprueba que estas 3 direcciones abren bien:
- `https://TU-WEB.vercel.app/manifest.webmanifest`
- `https://TU-WEB.vercel.app/sw.js`
- `https://TU-WEB.vercel.app/privacidad.html`

### 2. Empaqueta la app en PWABuilder (gratis, desde el navegador)
1. Entra en **https://www.pwabuilder.com/**
2. Pega tu URL de Vercel (`https://TU-WEB.vercel.app`) y pulsa **Start**.
3. Verás la puntuación verde en **Manifest** y **Service Worker**. Pulsa **Package for stores**.
4. En **Android**, pulsa **Generate Package** → deja el nombre de paquete (ej. `app.vercel.dvd_retro_studio.twa`) → **Download Package**.
5. Descomprime el ZIP descargado: dentro viene tu archivo **`.aab`** (el que pide Google Play) y tu archivo **`assetlinks.json`** (o la huella **SHA-256**).

### 3. Sube a Google Play Console
1. En **Google Play Console** → **Crear aplicación** → sube el archivo **`.aab`**.
2. En **Política de privacidad**, pega: `https://TU-WEB.vercel.app/privacidad.html`.
3. En **Declaración de permisos**, indica que la cámara y el micrófono se usan únicamente de forma local cuando el usuario graba en el Estudio (y puedes usar las capturas de `public/screenshots/` como referencia o capturas del móvil).
4. Cuando Google Play firme tu app, ve a **Configuración → Integridad de la aplicación → Firma de aplicaciones de Play**, copia el certificado **SHA-256**.

### 4. Quita la barra del navegador en Android (`assetlinks.json`)
1. Abre `public/.well-known/assetlinks.json` en GitHub.
2. Asegúrate de que `package_name` coincide con el de PWABuilder y sustituye `REEMPLAZAR_CON_TU_HUELLA_SHA256_DE_GOOGLE_PLAY` por la huella SHA-256 de Play Console.
3. Guarda en GitHub → Vercel lo publicará al instante y tu app se abrirá **a pantalla completa sin barra de Chrome**.
