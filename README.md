# 🚀 Copiloto Autónomo de Evaluación — Chromium Wayground

Asistente autónomo en tiempo real con **HUD Flotante Pasivo (Win32 `WS_EX_NOACTIVATE`)** que no roba foco ni interrumpe el modo de pantalla completa, y soporte para notificaciones en **Telegram**.

---

## ✨ Características Principales

- **HUD Flotante Sin Pérdida de Foco (`WS_EX_NOACTIVATE`)**: Muestra la respuesta sugerida en la esquina inferior derecha de la pantalla sin disparar eventos `blur`, `visibilitychange` ni salir de pantalla completa (`fullscreenchange` / `resize`).
- **Modo Espera Anti-Consumo de Tokens**: El navegador se abre en pausa para que inicies sesión y entres a la prueba tranquilamente; solo empieza a leer preguntas cuando presionas `ENTER` en la consola.
- **Menú Interactivo en Consola**: Configura tu propia `GEMINI_API_KEY`, el canal de alerta (`HUD`, `Telegram` o `Ambos`) y el modo `Auto-Click` sin tocar código.
- **Perfil Aislado y Persistente**: Crea automáticamente `.browser-user-profile` en local (ignorado por Git) para recordar tu sesión sin mezclar datos.

---

## 🛠️ Requisitos e Instalación

1. Tener instalado **[Node.js](https://nodejs.org/)** (v18 o superior) en Windows.
2. Clonar este repositorio e instalar las dependencias:

```bash
npm install
npx playwright install chromium
```

3. Obtener una API Key gratuita de Google Gemini en:
   👉 **[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)**

---

## ▶️ Uso Rápido

Ejecuta el asistente desde la terminal:

```bash
npm start
# o directamente:
node automation_runner.mjs
```

### En el Menú Interactivo:
1. Selecciona **`[2]`** para pegar tu `GEMINI_API_KEY` (se guardará localmente en tu archivo `.env`).
2. Selecciona **`[3]`** si deseas elegir entre la **Ventana Flotante (HUD)** o un **Bot de Telegram**.
3. Selecciona **`[1]`** para abrir el navegador en **Modo Espera**.
4. Inicia sesión en Wayground/Quizizz, entra al cuestionario y **presiona `[ENTER]` en la consola** para activar la lectura de preguntas en vivo.

---

## 🔒 Seguridad y Privacidad

- El archivo `.gitignore` excluye automáticamente tu archivo `.env` y la carpeta `.browser-user-profile/`, garantizando que nunca se suban tus claves de API, cookies ni sesiones a GitHub.
