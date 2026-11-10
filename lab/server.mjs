import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// Base de datos en memoria para el registro de telemetría del servidor
const serverLogs = [];

const server = http.createServer((req, res) => {
  // CORS para permitir experimentación modular
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Endpoint mock de infracciones de Wayground: POST /v1/games/:id/player-infraction
  if (req.method === 'POST' && url.pathname.includes('/player-infraction')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const entry = {
          id: serverLogs.length + 1,
          timestamp: new Date().toISOString(),
          type: 'INFRACTION_REST',
          path: url.pathname,
          payload: parsed.payload || parsed,
        };
        serverLogs.push(entry);
        console.log(`\x1b[31m[MOCK SERVER INFRACTION]\x1b[0m ${JSON.stringify(entry.payload)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Infraction recorded' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 2. Endpoint mock de balizas / telemetría: POST /api/telemetry o /other2 (sendBeacon)
  if (req.method === 'POST' && (url.pathname === '/api/telemetry' || url.pathname.includes('other2') || url.pathname.includes('frontend'))) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const entry = {
          id: serverLogs.length + 1,
          timestamp: new Date().toISOString(),
          type: 'BEACON_TELEMETRY',
          path: url.pathname,
          payload: parsed,
        };
        serverLogs.push(entry);
        console.log(`\x1b[33m[MOCK SERVER BEACON]\x1b[0m ${JSON.stringify(entry.payload)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      } catch {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      }
    });
    return;
  }

  // 3. API de consulta y vaciado de logs del servidor
  if (url.pathname === '/api/logs') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(serverLogs));
      return;
    }
    if (req.method === 'DELETE') {
      serverLogs.length = 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cleared: true }));
      return;
    }
  }

  // 4. Servir la página del laboratorio interactivo
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getLabHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

function getLabHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Laboratorio Experimental de Supervisión — Wayground Replication</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --danger: #ef4444;
      --warning: #f59e0b;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    body { background: var(--bg); color: var(--text); padding: 20px; font-size: 13px; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 15px; margin-bottom: 20px; }
    h1 { font-size: 18px; color: var(--primary); }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-active { background: #064e3b; color: #34d399; border: 1px solid #059669; }
    .badge-inactive { background: #450a0a; color: #f87171; border: 1px solid #b91c1c; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 15px; }
    .card h2 { font-size: 14px; margin-bottom: 10px; color: var(--primary); border-bottom: 1px solid var(--border); padding-bottom: 6px; display: flex; justify-content: space-between; }
    .control-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    button { background: #0284c7; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    button:hover { background: #0369a1; }
    button.btn-danger { background: #dc2626; }
    button.btn-danger:hover { background: #b91c1c; }
    input[type="text"], textarea { width: 100%; background: #0b1329; border: 1px solid var(--border); color: var(--text); padding: 6px; border-radius: 4px; margin-top: 5px; font-size: 12px; }
    .log-box { height: 180px; overflow-y: auto; background: #090d16; border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-size: 11px; }
    .log-item { margin-bottom: 4px; border-bottom: 1px solid #1a2234; padding-bottom: 3px; }
    .log-time { color: var(--text-muted); margin-right: 5px; }
    .log-tag { font-weight: bold; margin-right: 5px; }
    .tag-DOM { color: #f87171; }
    .tag-QUEUE { color: #c084fc; }
    .tag-SERVER { color: #34d399; }
    .tag-TOAST { color: #fbbf24; }
    /* Modal de pantalla completa */
    #fsWarningModal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; justify-content: center; align-items: center; flex-direction: column; backdrop-filter: blur(4px); }
    #fsWarningModal .modal-content { background: var(--card-bg); border: 2px solid var(--danger); border-radius: 8px; padding: 30px; text-align: center; max-width: 480px; }
    /* Toast banner */
    #toastContainer { position: fixed; bottom: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; }
    .toast { background: #7f1d1d; border: 1px solid #ef4444; color: white; padding: 10px 15px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-weight: bold; animation: fadeIn 0.2s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>

  <div id="fsWarningModal">
    <div class="modal-content">
      <h2 style="color: var(--danger); margin-bottom: 15px;">⚠️ Pantalla Completa Requerida</h2>
      <p style="margin-bottom: 20px; color: var(--text-muted);">
        Wayground FocusMode: Se ha detectado la salida de pantalla completa. No puedes continuar la evaluación en modo ventana.
      </p>
      <button onclick="restoreFullScreen()" style="font-size: 14px; padding: 10px 20px;">Reanudar Pantalla Completa</button>
    </div>
  </div>

  <div id="toastContainer"></div>

  <header>
    <div>
      <h1>LABORATORIO DE REPRODUCCIÓN EXPERIMENTAL — WAYGROUND / CHROMIUM</h1>
      <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">Emulación fiel de useAntiCheating, useFocusMode, useScreenfull y Dc()</div>
    </div>
    <div style="display: flex; gap: 10px; align-items: center;">
      <button onclick="exportLogsJson()">Exportar Registros JSON</button>
      <button onclick="clearAllLogs()" class="btn-danger">Limpiar Registros</button>
    </div>
  </header>

  <!-- Panel de Configuración de la Evaluación -->
  <div class="card" style="margin-bottom: 15px;">
    <h2>⚙️ Configuración del Test (Opciones de Sala Wayground)</h2>
    <div style="display: flex; flex-wrap: wrap; gap: 20px; font-size: 12px;">
      <label><input type="checkbox" id="cfgFocusMode" checked onchange="updateConfig()"> focusMode (Pantalla completa obligatoria)</label>
      <label><input type="checkbox" id="cfgAntiCheating" checked onchange="updateConfig()"> antiCheating.enabled</label>
      <label><input type="checkbox" id="cfgDisableRightClick" checked onchange="updateConfig()"> disableRightClick</label>
      <label><input type="checkbox" id="cfgDisableCopyPaste" checked onchange="updateConfig()"> disableCopyPaste</label>
      <label>Grace Period: <input type="number" id="cfgGracePeriod" value="3000" style="width: 70px;" onchange="updateConfig()"> ms</label>
      <label>Debounce Resize: <input type="number" id="cfgDebounce" value="500" style="width: 60px;" onchange="updateConfig()"> ms</label>
    </div>
  </div>

  <div class="grid">
    <!-- Panel 1: Pantalla Completa -->
    <div class="card">
      <h2>
        1. Pantalla Completa
        <span id="badgeFS" class="badge badge-inactive">NORMAL</span>
      </h2>
      <div class="control-row">
        <span>document.fullscreenElement:</span>
        <strong id="valFSElement">null</strong>
      </div>
      <div class="control-row">
        <span>Modal Bloqueante:</span>
        <strong id="valFSModal">Inactivo</strong>
      </div>
      <button onclick="toggleFS()" style="width: 100%; margin-top: 8px;">Alternar Pantalla Completa (F11/API)</button>
    </div>

    <!-- Panel 2: Foco y Tolerancia Temporal (3000ms) -->
    <div class="card">
      <h2>
        2. Foco de Ventana
        <span id="badgeFocus" class="badge badge-active">EN FOCO</span>
      </h2>
      <div class="control-row">
        <span>document.hasFocus():</span>
        <strong id="valHasFocus">true</strong>
      </div>
      <div class="control-row">
        <span>Tolerancia (Grace Period):</span>
        <strong id="valGraceTimer">0 ms / 3000 ms</strong>
      </div>
      <div style="margin-top: 8px;">
        <span style="font-size: 11px; color: var(--text-muted);">Prueba de excepción IFRAME:</span>
        <iframe id="testIframe" srcdoc="<body style='background:#1e293b;color:#38bdf8;font-family:sans-serif;font-size:11px;padding:8px;'>Hacer clic aquí no debe disparar playerExited (excepción comprobada)</body>" style="width: 100%; height: 50px; border: 1px dashed var(--border); border-radius: 4px; margin-top: 4px;"></iframe>
      </div>
    </div>

    <!-- Panel 3: Visibilidad y Ciclo de Vida -->
    <div class="card">
      <h2>
        3. Visibilidad y Lifecycle
        <span id="badgeVis" class="badge badge-active">VISIBLE</span>
      </h2>
      <div class="control-row">
        <span>document.visibilityState:</span>
        <strong id="valVisState">visible</strong>
      </div>
      <div class="control-row">
        <span>Tiempo en segundo plano:</span>
        <strong id="valBgTime">0 ms</strong>
      </div>
      <div class="control-row" style="margin-top: 8px;">
        <span>sendBeacon en Pagehide:</span>
        <strong style="color: var(--success);">Habilitado</strong>
      </div>
    </div>

    <!-- Panel 4: Portapapeles (Copy/Paste/Cut) -->
    <div class="card">
      <h2>4. Portapapeles</h2>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 5px;">Intenta copiar de esta pregunta de prueba o pegar en el campo:</div>
      <div id="testQuestion" style="background: #0b1329; padding: 6px; border: 1px solid var(--border); border-radius: 4px; user-select: text;">
        ¿Cuál es la velocidad de la luz en el vacío? (Texto protegido para prueba)
      </div>
      <input type="text" id="pasteInput" placeholder="Haz Ctrl+V aquí para probar pegado...">
    </div>

    <!-- Panel 5: Menú Contextual (Clic Derecho) -->
    <div class="card">
      <h2>5. Menú Contextual</h2>
      <div id="rightClickZone" style="background: #0b1329; border: 1px dashed var(--border); border-radius: 4px; padding: 25px; text-align: center; cursor: context-menu;">
        Haz clic derecho dentro de esta zona para probar prevención e infracción.
      </div>
      <div class="control-row" style="margin-top: 8px;">
        <span>Buffer de clics no bloqueados:</span>
        <strong id="valRcBuffer">0</strong>
      </div>
    </div>

    <!-- Panel 6: Geometría y Redimensión -->
    <div class="card">
      <h2>6. Redimensión y Heurística</h2>
      <div class="control-row">
        <span>Dimensiones actuales:</span>
        <strong id="valWinSize">0x0</strong>
      </div>
      <div class="control-row">
        <span>Dimensiones base (original):</span>
        <strong id="valOrigSize">0x0</strong>
      </div>
      <div class="control-row">
        <span>Heurística Google Lens:</span>
        <strong id="valGoogleLens" style="color: var(--success);">Normal</strong>
      </div>
    </div>
  </div>

  <!-- Cronología de Eventos y Telemetría -->
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
    <div class="card">
      <h2>📜 Cronología de Eventos Cliente (DOM & Composables)</h2>
      <div id="clientLogBox" class="log-box"></div>
    </div>
    <div class="card">
      <h2>📡 Telemetría Recibida por el Servidor Mock (POST / Balizas)</h2>
      <div id="serverLogBox" class="log-box"></div>
    </div>
  </div>

  <script>
    // --- ESTADO Y CONFIGURACIÓN LOCAL ---
    const state = {
      gameId: 'TEST-ROOM-123',
      playerId: 'PLAYER-001',
      questionId: 'Q-01',
      config: {
        focusMode: true,
        antiCheatingEnabled: true,
        disableRightClick: true,
        disableCopyPaste: true,
        gracePeriodMs: 3000,
        debounceMs: 500,
      },
      originalSize: { width: window.innerWidth, height: window.innerHeight },
      focusStartTime: null,
      visibilityStartTime: null,
      rightClickBuffer: [],
      clientLogs: [],
    };

    function updateConfig() {
      state.config.focusMode = document.getElementById('cfgFocusMode').checked;
      state.config.antiCheatingEnabled = document.getElementById('cfgAntiCheating').checked;
      state.config.disableRightClick = document.getElementById('cfgDisableRightClick').checked;
      state.config.disableCopyPaste = document.getElementById('cfgDisableCopyPaste').checked;
      state.config.gracePeriodMs = Number(document.getElementById('cfgGracePeriod').value) || 3000;
      state.config.debounceMs = Number(document.getElementById('cfgDebounce').value) || 500;
      logClient('CONFIG', 'Opciones de supervisión actualizadas', state.config);
    }

    // --- COLA FIFO ASÍNCRONA (useQueue replica) ---
    const queue = [];
    let isQueueRunning = false;

    function addToQueue(fn) {
      queue.push(fn);
      if (!isQueueRunning) {
        isQueueRunning = true;
        processQueue();
      }
    }

    async function processQueue() {
      if (queue.length === 0) {
        isQueueRunning = false;
        return;
      }
      const item = queue[0];
      try {
        await item();
      } catch (e) {
        console.error('Queue error:', e);
      }
      queue.shift();
      processQueue();
    }

    // --- DESPACHO DE INFRACCIONES AL SERVIDOR ---
    async function sendInfraction(infractionType, infractionMeta = {}) {
      if (!state.config.antiCheatingEnabled) return;
      const payload = {
        infractionType,
        playerId: state.playerId,
        questionId: state.questionId,
        gameId: state.gameId,
        infractionMeta,
        timestamp: new Date().toISOString(),
      };
      logClient('QUEUE', 'Encolando infracción para /player-infraction', payload);

      addToQueue(async () => {
        try {
          const res = await fetch(\`/v1/games/\${state.gameId}/player-infraction\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload }),
          });
          const data = await res.json();
          logClient('QUEUE', 'Infracción procesada por servidor', data);
        } catch (err) {
          logClient('QUEUE', 'Error de red en infracción', { error: err.message });
        }
      });
    }

    function showToast(message) {
      logClient('TOAST', message);
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerText = message;
      container.appendChild(toast);
      setTimeout(() => { toast.remove(); }, 4000);
    }

    // --- 1. FULLSCREEN HANDLER ---
    function isFs() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    }

    function updateFsUI() {
      const active = isFs();
      const badge = document.getElementById('badgeFS');
      badge.innerText = active ? 'COMPLETA' : 'NORMAL';
      badge.className = 'badge ' + (active ? 'badge-active' : 'badge-inactive');
      document.getElementById('valFSElement').innerText = active ? document.fullscreenElement?.tagName : 'null';

      const modal = document.getElementById('fsWarningModal');
      if (state.config.focusMode && !active) {
        modal.style.display = 'flex';
        document.getElementById('valFSModal').innerText = 'ACTIVO (Bloqueando UI)';
      } else {
        modal.style.display = 'none';
        document.getElementById('valFSModal').innerText = 'Inactivo';
      }
    }

    document.addEventListener('fullscreenchange', () => {
      const active = isFs();
      logClient('DOM', 'fullscreenchange disparado', { isFullscreen: active });
      updateFsUI();
      if (!active && state.config.focusMode) {
        showToast('Your teacher has been alerted that you exited fullscreen mode.');
        sendInfraction('fullscreenExitDetected');
      }
    });

    function toggleFS() {
      if (!isFs()) {
        document.documentElement.requestFullscreen().catch(e => console.warn(e));
      } else {
        document.exitFullscreen().catch(e => console.warn(e));
      }
    }

    function restoreFullScreen() {
      document.documentElement.requestFullscreen().catch(e => console.warn(e));
    }

    // --- 2. FOCUS & BLUR WITH GRACE PERIOD (3000ms) ---
    function onBlurHandler(e) {
      // Excepción IFRAME comprobada
      if (document.activeElement?.tagName === 'IFRAME' && document.hasFocus()) {
        logClient('DOM', 'blur ignorado por excepción IFRAME interna');
        return;
      }
      state.focusStartTime = Date.now();
      document.getElementById('badgeFocus').innerText = 'SIN FOCO';
      document.getElementById('badgeFocus').className = 'badge badge-inactive';
      document.getElementById('valHasFocus').innerText = 'false';
      logClient('DOM', 'window.blur detectado. Temporizador de gracia iniciado (3000ms)');
    }

    function onFocusHandler(e) {
      document.getElementById('badgeFocus').innerText = 'EN FOCO';
      document.getElementById('badgeFocus').className = 'badge badge-active';
      document.getElementById('valHasFocus').innerText = 'true';

      if (state.focusStartTime) {
        const timeOutOfFocus = Date.now() - state.focusStartTime;
        state.focusStartTime = null;
        logClient('DOM', \`window.focus detectado. Ausencia: \${timeOutOfFocus} ms\`);

        if (timeOutOfFocus > state.config.gracePeriodMs) {
          showToast('Your teacher has been alerted that you left the tab.');
          sendInfraction('playerExited');
          sendInfraction('playerResumed', { timeOutOfFocus });
        } else {
          logClient('DOM', \`Ausencia absorbida por margen de gracia (\${timeOutOfFocus} ms <= \${state.config.gracePeriodMs} ms). Sin reporte.\`);
        }
      }
    }

    window.addEventListener('blur', onBlurHandler);
    window.addEventListener('focus', onFocusHandler);

    // --- 3. VISIBILITY & LIFECYCLE ---
    document.addEventListener('visibilitychange', () => {
      const stateStr = document.visibilityState;
      document.getElementById('valVisState').innerText = stateStr;
      const isVisible = stateStr === 'visible';
      const badge = document.getElementById('badgeVis');
      badge.innerText = isVisible ? 'VISIBLE' : 'HIDDEN';
      badge.className = 'badge ' + (isVisible ? 'badge-active' : 'badge-inactive');

      logClient('DOM', 'visibilitychange disparado', { visibilityState: stateStr, hidden: document.hidden });

      if (stateStr === 'hidden') {
        state.visibilityStartTime = Date.now();
        // Vaciado forzado de telemetría por baliza
        navigator.sendBeacon('/api/telemetry', JSON.stringify({ event: 'PAGE_HIDDEN', timestamp: Date.now() }));
      } else if (state.visibilityStartTime) {
        const spent = Date.now() - state.visibilityStartTime;
        state.visibilityStartTime = null;
        document.getElementById('valBgTime').innerText = spent + ' ms';
        fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'APP_VISIBILITY_CHANGE', timeSpent: spent })
        });
      }
    });

    window.addEventListener('pagehide', () => {
      logClient('DOM', 'pagehide disparado. Vaciando cola vía navigator.sendBeacon');
      navigator.sendBeacon('/api/telemetry', JSON.stringify({ event: 'PAGE_UNLOAD_FLUSH', timestamp: Date.now() }));
    });

    // --- 4. CLIPBOARD (COPY / PASTE / CUT) ---
    document.addEventListener('copy', (e) => {
      logClient('DOM', 'copy disparado');
      if (state.config.disableCopyPaste) {
        e.preventDefault();
        showToast('Your teacher has been alerted that you copy pasted content.');
        sendInfraction('pasteDetected');
      }
    });

    document.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') || '';
      logClient('DOM', 'paste disparado', { length: text.length });
      if (state.config.disableCopyPaste) {
        e.preventDefault();
        showToast('Your teacher has been alerted that you copy pasted content.');
        sendInfraction('pasteDetected', { clipboardLength: text.length });
      }
    });

    // --- 5. CONTEXT MENU (RIGHT CLICK) ---
    document.getElementById('rightClickZone').addEventListener('contextmenu', (e) => {
      logClient('DOM', 'contextmenu disparado en zona de prueba');
      if (state.config.disableRightClick) {
        e.preventDefault();
        showToast('Your teacher has been alerted that you right-clicked.');
        sendInfraction('rightClickDetected');
      } else {
        state.rightClickBuffer.push(Date.now());
        document.getElementById('valRcBuffer').innerText = state.rightClickBuffer.length;
      }
    });

    // --- 6. RESIZE DEBOUNCE & GOOGLE LENS HEURISTIC ---
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      document.getElementById('valWinSize').innerText = \`\${window.innerWidth}x\${window.innerHeight}\`;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const origW = state.originalSize.width;
        const origH = state.originalSize.height;

        // Heurística de Google Lens comprobada: relación de aspecto anómala y reducción lateral abrupta
        const isGoogleLens = (w < origW * 0.65 && Math.abs(h - origH) < 50);
        document.getElementById('valGoogleLens').innerText = isGoogleLens ? 'DETECTADO (Sidebar)' : 'Normal';
        document.getElementById('valGoogleLens').style.color = isGoogleLens ? 'var(--danger)' : 'var(--success)';

        if (isGoogleLens) {
          showToast('Google Lens / Sidebar split screen detectado.');
          sendInfraction('googleLens', { windowWidth: w, windowHeight: h, originalWindowWidth: origW, originalWindowHeight: origH });
        } else if (Math.abs(w - origW) > 80 || Math.abs(h - origH) > 80) {
          showToast('Your teacher has been alerted that you resized the window.');
          sendInfraction('windowResizeDetected', { windowWidth: w, windowHeight: h });
        }
      }, state.config.debounceMs);
    });

    // --- UTILIDADES DE LOGS ---
    function logClient(category, msg, details = null) {
      const entry = {
        time: new Date().toLocaleTimeString(),
        category,
        msg,
        details,
      };
      state.clientLogs.push(entry);

      const box = document.getElementById('clientLogBox');
      const div = document.createElement('div');
      div.className = 'log-item';
      div.innerHTML = \`<span class="log-time">\${entry.time}</span><span class="log-tag tag-\${category}">[\${category}]</span>\${msg}\` +
        (details ? \`<pre style="color:#94a3b8;font-size:10px;">\${JSON.stringify(details)}</pre>\` : '');
      box.prepend(div);
    }

    async function pollServerLogs() {
      try {
        const res = await fetch('/api/logs');
        const logs = await res.json();
        const box = document.getElementById('serverLogBox');
        box.innerHTML = '';
        logs.slice().reverse().forEach(entry => {
          const div = document.createElement('div');
          div.className = 'log-item';
          div.innerHTML = \`<span class="log-time">\${entry.timestamp.split('T')[1].replace('Z','')}</span><span class="log-tag tag-SERVER">[\${entry.type}]</span>\` +
            \`<pre style="color:#34d399;font-size:10px;">\${JSON.stringify(entry.payload)}</pre>\`;
          box.appendChild(div);
        });
      } catch {}
    }
    setInterval(pollServerLogs, 1000);

    function exportLogsJson() {
      fetch('/api/logs').then(r => r.json()).then(sLogs => {
        const exportData = {
          exportTimestamp: new Date().toISOString(),
          clientLogs: state.clientLogs,
          serverReceivedLogs: sLogs,
          testConfiguration: state.config,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = \`laboratory-results-\${Date.now()}.json\`;
        a.click();
      });
    }

    async function clearAllLogs() {
      state.clientLogs = [];
      document.getElementById('clientLogBox').innerHTML = '';
      await fetch('/api/logs', { method: 'DELETE' });
      document.getElementById('serverLogBox').innerHTML = '';
      logClient('CONFIG', 'Registros reiniciados');
    }

    // Inicialización de dimensiones
    document.getElementById('valOrigSize').innerText = \`\${state.originalSize.width}x\${state.originalSize.height}\`;
    document.getElementById('valWinSize').innerText = \`\${window.innerWidth}x\${window.innerHeight}\`;
    updateFsUI();
  </script>
</body>
</html>`;
}

server.listen(PORT, () => {
  console.log(`\x1b[32m[LABORATORIO INICIADO]\x1b[0m Servidor escuchando en http://localhost:${PORT}`);
});
