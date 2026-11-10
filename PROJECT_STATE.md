# ESTADO DEL PROYECTO — INVESTIGACIÓN DE CHROMIUM EXPERIMENTAL Y WAYGROUND (QUIZIZZ)

**Fecha de actualización:** 2026-11-03  
**Entorno de ejecución:** Windows 10/11 x64 | Node.js v24.15.0 | Playwright Chromium 156.0.8078.4 (v1248)  
**Directorio raíz:** `C:\Users\Mi Equipo\Documents\ChromiumQuizzis`

---

## 1. Archivos Existentes

### Workspace Principal (`C:\Users\Mi Equipo\Documents\ChromiumQuizzis`)
- [`package.json`](file:///c:/Users/Mi%20Equipo/Documents/ChromiumQuizzis/package.json): Configuración del proyecto en modo ESM (`"type": "module"`), script de ejecución `"start": "node monitor.mjs"` y dependencia de desarrollo `playwright` (^1.64.1).
- [`package-lock.json`](file:///c:/Users/Mi%20Equipo/Documents/ChromiumQuizzis/package-lock.json): Árbol de dependencias resueltas de npm.
- [`node_modules/`](file:///c:/Users/Mi%20Equipo/Documents/ChromiumQuizzis/node_modules/): Módulos instalados para automatización e instrumentación vía CDP y Playwright.
- [`monitor.mjs`](file:///c:/Users/Mi%20Equipo/Documents/ChromiumQuizzis/monitor.mjs): Arnés de instrumentación en tiempo real para Chromium. Inyecta hooks en `EventTarget.prototype.addEventListener`, monkey-patching sobre `WebSocket`, `fetch`, `XMLHttpRequest` y `navigator.sendBeacon`, además de escuchas directas en el protocolo CDP de Playwright.

### Scratch Scripts de Análisis y Extracción (`.../.gemini/antigravity/brain/.../scratch/`)
- `inspect_join.js`: Descarga el HTML de inicio de Wayground (`/join`) y extrae referencias a bundles principales.
- `analyze_bundle.js`: Análisis estático y búsqueda léxica de palabras clave en el bundle principal (`index.B79U7qC1.js`).
- `check_imports.js`: Extractor de las 81 importaciones dinámicas presentes en el bundle de entrada.
- `scan_all_chunks.js`: Escáner automatizado de los 66 chunks de la aplicación identificando módulos de supervisión.
- `inspect_ingame.js`: Análisis del chunk de la vista de juego (`InGameApp.DILvyiP8.js`).
- `find_cr_inside.js`, `find_cr_import.js`, `inspect_cr.js`, `inspect_around_cr.js`: Rastreo del composable de control de fraude.
- `find_cu_cr.js`, `find_module_paths.js`: Resolución de dependencias e identificación de los módulos fuente `useAntiCheating.DbXxYjR9.js` y `useFocusMode.VI9SmPm8.js`.
- `read_anticheat_files.js`: Extracción y desminificación del código fuente de `useAntiCheating.DbXxYjR9.js` y `useFocusMode.VI9SmPm8.js`.
- `read_screenfull.js`: Extracción del módulo wrapper de pantalla completa (`useScreenfull.DjUvoJkM.js`).
- `inspect_composables.js`: Desglose del composable de foco `Dc()` y del componente modal `FullScreenExitWarning`.
- `inspect_at.js`: Identificación del endpoint REST de reporte de infracciones (`zz` / `writePlayerInfraction`).

---

## 2. Investigaciones Completadas

1. **Rebranding e infraestructura:**
   - Confirmación de la migración de Quizizz a **Wayground** (`wayground.com`, endpoints CDN en `cf.quizizz.com/app-bundle/join/upload/js/`).
2. **Mapeo del subsistema de supervisión del cliente:**
   - Identificación y extracción de los módulos clave:
     - `useAntiCheating.DbXxYjR9.js` (Lógica central de fraude)
     - `useFocusMode.VI9SmPm8.js` (Supervisión de pantalla completa y modo examen con Web Worker)
     - `useScreenfull.DjUvoJkM.js` (Normalización de Fullscreen API y cola de ejecución asíncrona)
     - `InGameApp.DILvyiP8.js` (Orquestador Vue de la partida)
3. **Catálogo de infracciones y eventos estudiados:**
   - `fullscreenchange` / `document.fullscreenElement` -> `fullscreenExitDetected`
   - `window.blur` / `window.focus` -> `playerExited`, `playerResumed`
   - `document.visibilityState` / `visibilitychange` -> `APP_VISIBILITY_CHANGE` (Analytics Beacon)
   - `copy` / `paste` / `cut` -> `pasteDetected`
   - `contextmenu` -> `rightClickDetected`
   - `resize` -> `windowResizeDetected` / `googleLens`
4. **Mecanismo de transporte y endpoints:**
   - Canal REST: `POST /v1/games/{gameId}/player-infraction`
   - Canal de Baliza: `navigator.sendBeacon` activado en transiciones de descarga de página y ocultación.

---

## 3. Hallazgos Verificados

- **Ventana de tolerancia temporal (Grace Period):** `useAntiCheating` define una constante estricta `const lt = 3000` (3000 ms). Si una pérdida de foco dura menos de 3 segundos, no se genera reporte de infracción `playerExited` ni `playerResumed`.
- **Excepción de IFRAME en Foco:** En `Dc()`, si se dispara un evento `blur` pero `document.activeElement.tagName === "IFRAME"` y `document.hasFocus()` es verdadero, no se considera pérdida de foco.
- **Debounce de redimensionamiento:** El evento `resize` está regulado con `debounce(..., 500)` de lodash e incluye un detector heurístico de divisiones de pantalla asociadas a Google Lens.
- **Cola secuencial de despacho:** `useScreenfull` implementa `useQueue` (`addToQueue`) que encola las peticiones asíncronas de infracciones y las procesa secuencialmente para evitar condiciones de carrera.
- **Bloqueo de UI:** Si `isAppFullscreen` pasa a `false` mientras `focusMode` está activo, `showFullScreenBlockedModal` monta de inmediato el componente `FullScreenExitWarning`, deteniendo el flujo del juego hasta que el estudiante restaura pantalla completa.

---

## 4. Hipótesis Pendientes

1. **Dependencia de la sesión WebSocket:** ¿El servidor valida la coherencia entre las infracciones emitidas por HTTP (`/player-infraction`) y los pings/heartbeats de la conexión Socket.io del juego?
2. **Impacto de la emulación CDP:** ¿Modificar `document.visibilityState` y `document.hasFocus` exclusivamente a nivel de DOM mediante CDP es suficiente para mantener el juego en estado activo sin alertar al profesor, o existen comprobaciones temporales cruzadas en el backend?
3. **Detección de extensiones:** `useAntiCheating` cuenta con `EXTENSION_DETECTED` (`"extensionDetected"`). Queda pendiente verificar qué firmas de extensiones o llamadas a APIs busca activamente.
4. **Ciclo de vida profundo:** Evaluación del comportamiento de Wayground bajo congelamiento forzado de pestañas (BFCache / Chromium Tab Discarding).

---

## 5. Herramientas Utilizadas

- **Playwright (Chromium Headless / Headful):** Automatización del navegador e inyección previa a la carga (`addInitScript`).
- **Chrome DevTools Protocol (CDP):** Inspección de bajo nivel para WebSockets y frames de red.
- **Fetch / Static Analyzers (Node.js):** Descarga, inspección y descompilado estático de bundles y chunks de producción.
- **PowerShell / CLI:** Gestión de archivos y ejecución de pruebas.

---

## 6. Próximas Tareas

- **Fase 2:** Reconstrucción de dependencias y generación de `ARCHITECTURE.md` con diagramas Mermaid.
- **Fase 3:** Reconstrucción detallada del flujo temporal de eventos (`EVENT_FLOW.md`).
- **Fase 4:** Diseño y arranque de la instancia aislada de Chromium Experimental.
- **Fase 5:** Desarrollo del Laboratorio Local (servidor mock interactivo para simular el comportamiento de Wayground).
- **Fase 6:** Evaluación comparativa del comportamiento de las APIs bajo diferentes configuraciones.
- **Fase 7:** Documentación final y consolidación de resultados.
