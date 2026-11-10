# RECONSTRUCCIÓN DEL FLUJO DE EVENTOS — WAYGROUND (QUIZIZZ)

**Estado de verificación:** Código comprobado a partir de los manejadores desminificados en `useAntiCheating.DbXxYjR9.js`, `useFocusMode.VI9SmPm8.js`, `useScreenfull.DjUvoJkM.js` e `InGameApp.DILvyiP8.js`.

---

## 1. Escenario A: Pérdida y Recuperación Rápida de Foco (Margen $\le$ 3000 ms)

Wayground implementa una constante de tolerancia estricta (`const lt = 3000`). Si el usuario cambia brevemente de ventana o minimiza pero regresa en menos de 3 segundos, la infracción se descarta.

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuario (SO / Teclado)
    participant DOM as Chromium (window / document)
    participant DC as Composable Dc()
    participant UAC as useAntiCheating
    participant Toast as $toasts Service
    participant Server as Wayground REST API

    User->>DOM: Alt + Tab o Minimizar ventana
    DOM->>DC: Evento "blur"
    DC->>DC: Comprueba IFRAME (no aplica) -> tabFocus = false
    DC->>UAC: Dispara watch(tabFocus) -> O(false)
    Note over UAC: Guarda marca temporal de salida:<br/>y.value = Date.now()
    
    Note over User,DOM: Transcurren 1800 ms (< 3000 ms)
    
    User->>DOM: Vuelve a enfocar ventana de Wayground
    DOM->>DC: Evento "focus"
    DC->>DC: tabFocus = true
    DC->>UAC: Dispara watch(tabFocus) -> O(true)
    Note over UAC: Calcula: s = Date.now() - y.value (1800 ms)<br/>Evalúa: s > lt (1800 > 3000 = FALSO)
    Note over UAC: Limpia temporizador: y.value = undefined
    
    Note over Toast,Server: NO se muestra alerta en UI y NO se envía reporte al servidor
```

---

## 2. Escenario B: Pérdida Prolongada de Foco (> 3000 ms)

Cuando la ausencia supera el margen de 3 segundos, al regresar el sistema emite dos infracciones ordenadas cronológicamente para reconstruir el historial exacto del incidente.

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuario
    participant DOM as Chromium Core
    participant UAC as useAntiCheating
    participant Queue as useQueue (FIFO)
    participant Toast as UI Alert ($toasts)
    participant Server as POST /player-infraction

    User->>DOM: Cambia de pestaña / Abre otra aplicación
    DOM->>UAC: Evento "blur" -> O(false)
    Note over UAC: y.value = 1710000000000 (T_inicio)
    
    Note over User,DOM: Pasan 8500 ms (> 3000 ms)
    
    User->>DOM: Regresa a la pestaña del examen
    DOM->>UAC: Evento "focus" -> O(true)
    Note over UAC: Calcula s = Date.now() - y.value (8500 ms)<br/>s > 3000 es VERDADERO
    
    UAC->>Queue: addToQueue(c("playerExited"))
    UAC->>Queue: addToQueue(c("playerResumed", { timeOutOfFocus: 8500 }))
    UAC->>Toast: pushTabSwitchAlert()<br/>"Your teacher has been alerted that you left the tab."
    Note over UAC: Limpia y.value = undefined
    
    Queue->>Server: HTTP POST /v1/games/:id/player-infraction<br/>Payload: { infractionType: "playerExited", questionId, playerId }
    Server-->>Queue: 200 OK
    Queue->>Server: HTTP POST /v1/games/:id/player-infraction<br/>Payload: { infractionType: "playerResumed", infractionMeta: { timeOutOfFocus: 8500 } }
    Server-->>Queue: 200 OK
```

---

## 3. Escenario C: Salida de Pantalla Completa en Modo Foco

El modo examen exige pantalla completa obligatoria. Si el usuario pulsa `Esc`, `F11` o una combinación de teclas del sistema para salir de pantalla completa, se desencadena una doble acción: advertencia visual bloqueante y reporte inmediato.

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuario
    participant DOM as Chromium (Fullscreen API)
    participant SF as useScreenfull
    participant UFM as useFocusMode
    participant UAC as useAntiCheating
    participant Modal as FullScreenExitWarning (Modal)
    participant Queue as useQueue
    participant Server as POST /player-infraction

    User->>DOM: Presiona ESC o F11
    DOM->>SF: Evento "fullscreenchange"
    SF->>SF: Actualiza isAppFullscreen = !!document.fullscreenElement (false)
    
    par Control de Interfaz (useFocusMode)
        SF->>UFM: watch(isAppFullscreen, false)
        Note over UFM: Valida: isFullscreenEnabled && !hasSeenSummary<br/>showFullScreenBlockedModal.value = true
        UFM->>Modal: Monta y despliega modal bloqueante en UI
        Note over Modal: Bloquea interacción con las preguntas hasta restaurar pantalla
    and Detección de Trampa (useAntiCheating)
        SF->>UAC: Callback Pe()
        UAC->>Queue: addToQueue(c("fullscreenExitDetected"))
        UAC->>UAC: Toast: "Your teacher has been alerted that you exited fullscreen mode."
        Queue->>Server: HTTP POST /v1/games/:id/player-infraction<br/>Payload: { infractionType: "fullscreenExitDetected" }
    end

    User->>Modal: Clic en botón "Resume Test in Fullscreen"
    Modal->>SF: toggleFullScreen() -> requestFullscreen()
    DOM->>SF: Evento "fullscreenchange" (isFullscreen = true)
    SF->>UFM: isAppFullscreen = true -> showFullScreenBlockedModal = false
    UFM->>Modal: Desmonta el modal bloqueante
```

---

## 4. Escenario D: Menú Contextual (Clic Derecho) y Portapapeles

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuario
    participant DOM as Chromium Input
    participant UAC as useAntiCheating
    participant Queue as useQueue
    participant Toast as $toasts
    participant Server as POST /player-infraction

    alt Clic Derecho con disableRightClick = true
        User->>DOM: Clic derecho (ratón)
        DOM->>UAC: Evento "contextmenu" -> Ge(e)
        Note over UAC: e.preventDefault() (Menú del navegador bloqueado)
        UAC->>Queue: addToQueue(c("rightClickDetected"))
        UAC->>Toast: "Your teacher has been alerted that you right-clicked."
        Queue->>Server: POST /player-infraction { infractionType: "rightClickDetected" }
    else Intento de Copia/Pega con disableCopyPaste = true
        User->>DOM: Ctrl + C o Ctrl + V
        DOM->>UAC: Evento "copy" / "paste" -> Le(e) / we(e)
        Note over UAC: e.preventDefault() (Acción cancelada)
        Note over UAC: En paste: extrae clipboardLength
        UAC->>Queue: addToQueue(c("pasteDetected", { clipboardLength }))
        UAC->>Toast: "Your teacher has been alerted that you copy pasted content."
        Queue->>Server: POST /player-infraction { infractionType: "pasteDetected", infractionMeta: { clipboardLength } }
    end
```

---

## 5. Escenario E: Redimensionamiento de Ventana y Detección de Google Lens

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuario
    participant DOM as Chromium (window.resize)
    participant Lodash as lodash.debounce (500 ms)
    participant UAC as useAntiCheating
    participant Queue as useQueue
    participant Server as POST /player-infraction

    User->>DOM: Arrastra borde de ventana / Activa Snap / Abre Google Lens lateral
    DOM->>Lodash: Múltiples eventos "resize"
    Note over Lodash: Espera 500 ms de estabilidad sin nuevos eventos
    Lodash->>UAC: ae(e) ejecutado
    
    UAC->>UAC: Evalúa Ne({ windowWidth, windowHeight, originalWidth, originalHeight })
    
    alt Heurística detecta patrón de Google Lens / Sidebar
        Note over UAC: Clasificación: GOOGLE_LENS_DETECTED
        UAC->>Queue: addToQueue(c("googleLens", { windowWidth, windowHeight, originalWindowWidth, originalWindowHeight }))
        Queue->>Server: POST /player-infraction { infractionType: "googleLens", ... }
    else Redimensión ordinaria
        Note over UAC: Clasificación: WINDOW_RESIZE_DETECTED
        UAC->>Queue: addToQueue(c("windowResizeDetected", { windowWidth, windowHeight }))
        UAC->>UAC: Toast: "Your teacher has been alerted that you resized the window."
        Queue->>Server: POST /player-infraction { infractionType: "windowResizeDetected", ... }
    end
```

---

## 6. Escenario F: Ciclo de Vida de Página y Vaciado Abrupto (`Page Lifecycle`)

Cuando el usuario cierra la ventana, recarga abruptamente o el sistema suspende el proceso de Chromium:

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuario / Sistema Operativo
    participant DOM as Chromium Lifecycle Engine
    participant IGA as InGameApp
    participant Index as Telemetry Dispatcher (index.js)
    participant Server as Servidor Wayground (Collector)

    User->>DOM: Cierra pestaña / Suspende proceso (Tab Freeze / Discard)
    DOM->>IGA: Evento "pagehide"
    IGA->>Index: pageHideHandler()
    
    Note over Index: Revisa fetchQueue en memoria con eventos pendientes
    loop Para cada elemento en fetchQueue
        Index->>Server: navigator.sendBeacon(endpoint, JSON.stringify(data))
        Note over Server: La solicitud HTTP POST asíncrona se garantiza<br/>incluso tras la destrucción del contexto JS
    end
    Note over Index: Limpia fetchQueue = []
```

---

## 7. Gestión de Errores y Reintentos en el Canal de Transporte

1. **Captura local de excepciones:** Toda llamada en cola está envuelta en bloques `try / catch`:
   ```javascript
   c = (e, t, s) => async () => {
     if (!n.isLDBEnabled)
       try {
         const u = Re(e, t, s);
         const p = { infractionType: u.activityType, playerId: u.playerId, questionId: u.questionId, infractionMeta: u.infractionMeta };
         return await at(p, B.value);
       } catch (u) {
         h.error("Error creating test game activity:", u);
       }
   };
   ```
2. **Resiliencia de la interfaz:** Si la red se cae o el endpoint `/player-infraction` devuelve un código de error HTTP (500/503), el error solo se imprime en consola (`h.error`). El motor del juego **no detiene** la partida ni bloquea al estudiante, permitiendo continuar contestando.
3. **Reintentos en Balizas (`sendUsingBeacon`):** Para eventos analíticos generales, si `navigator.sendBeacon` retorna `false` (cola del navegador llena), implementa un reintento con retardo exponencial:
   ```javascript
   sendUsingBeacon(t, s, n = 0) {
     const o = JSON.stringify(t);
     if (!navigator.sendBeacon(this.getEventEndpoint(s), o) && n < fA) {
       const r = pA(n); // Backoff exponencial
       setTimeout(() => { this.sendUsingBeacon(t, s, n + 1); }, r);
     }
   }
   ```
