import { chromium } from 'playwright';

// Configuración de URL objetivo (puedes pasar la URL por argumento de línea de comandos)
const targetUrl = process.argv[2] || 'https://quizizz.com/join';

async function main() {
  console.log('='.repeat(80));
  console.log('🔬 CHROMIUM TELEMETRY & EVENT SNIFFER');
  console.log('Iniciando Chromium en modo visible (Headless: false)...');
  console.log(`URL objetivo: ${targetUrl}`);
  console.log('='.repeat(80));

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled', // Evita flag webdriver básico
      '--start-maximized',
    ],
  });

  const context = await browser.newContext({
    viewport: null, // Usa tamaño real de ventana
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // 1. Inyección de telemetría previa a la ejecución de scripts del sitio (addInitScript)
  await page.addInitScript(() => {
    const timestamp = () => new Date().toISOString().split('T')[1].replace('Z', '');
    const logEvent = (category, name, details = {}) => {
      console.log(
        JSON.stringify({
          _customProbe: true,
          timestamp: timestamp(),
          category,
          name,
          details,
        })
      );
    };

    // A. Interceptar registro y disparo de EventListeners de ventana y documento
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const monitoredEvents = new Set([
      'visibilitychange',
      'blur',
      'focus',
      'pagehide',
      'pageshow',
      'beforeunload',
      'resize',
      'fullscreenchange',
      'mouseleave',
      'mouseout',
      'keydown',
      'keyup',
      'copy',
      'paste',
      'cut',
      'contextmenu',
    ]);

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (monitoredEvents.has(type)) {
        const targetDesc =
          this === window ? 'window' : this === document ? 'document' : this.tagName || 'EventTarget';
        
        // Obtenemos el stack trace de dónde la web registró este listener
        const regStack = new Error().stack?.split('\n').slice(2, 4).map(s => s.trim()).join(' -> ');
        
        logEvent('LISTENER_REGISTERED', type, {
          target: targetDesc,
          registeredAt: regStack,
        });

        // Envolvemos el callback para saber cuándo se ejecuta
        const wrappedListener = function (event) {
          logEvent('DOM_EVENT_TRIGGERED', type, {
            target: targetDesc,
            visibilityState: document.visibilityState,
            hidden: document.hidden,
            windowSize: `${window.innerWidth}x${window.innerHeight}`,
            outerSize: `${window.outerWidth}x${window.outerHeight}`,
            key: event.key || undefined,
            hasFocus: document.hasFocus ? document.hasFocus() : undefined,
          });

          if (typeof listener === 'function') {
            return listener.apply(this, arguments);
          } else if (listener && typeof listener.handleEvent === 'function') {
            return listener.handleEvent.apply(listener, arguments);
          }
        };

        return originalAddEventListener.call(this, type, wrappedListener, options);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    // B. Interceptar WebSocket en el runtime del navegador
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function (...args) {
      const wsInstance = new OriginalWebSocket(...args);
      const url = args[0];
      logEvent('WS_CLIENT_INIT', 'WebSocket', { url });

      const originalSend = wsInstance.send;
      wsInstance.send = function (data) {
        let payload = data;
        try {
          if (typeof data === 'string') {
            payload = JSON.parse(data);
          }
        } catch (_) {}
        logEvent('WS_CLIENT_SEND', 'send', { url, payload });
        return originalSend.apply(this, arguments);
      };

      wsInstance.addEventListener('message', (event) => {
        let payload = event.data;
        try {
          if (typeof payload === 'string') {
            payload = JSON.parse(payload);
          }
        } catch (_) {}
        logEvent('WS_CLIENT_RECV', 'message', { url, payload });
      });

      return wsInstance;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;

    // C. Interceptar Fetch
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource?.url;
      const method = config?.method || 'GET';
      const body = config?.body;

      logEvent('HTTP_FETCH', method, { url, body: body ? String(body).substring(0, 500) : null });
      return originalFetch.apply(this, arguments);
    };

    // D. Interceptar sendBeacon
    if (navigator.sendBeacon) {
      const origBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function (url, data) {
        logEvent('NAVIGATOR_BEACON', 'sendBeacon', { url, data: String(data).substring(0, 500) });
        return origBeacon.apply(this, arguments);
      };
    }
  });

  // 2. Interceptar consola del navegador para recibir logs estructurados
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('_customProbe')) {
      try {
        const data = JSON.parse(text);
        renderLog(data);
      } catch {
        console.log(`[BROWSER CONSOLE] ${text}`);
      }
    }
  });

  // 3. Monitoreo a nivel de protocolo de red (Playwright Network)
  page.on('websocket', (ws) => {
    console.log(`\x1b[36m[CDP WS OPEN]\x1b[0m ${ws.url()}`);
    ws.on('framereceived', (frame) => {
      if (frame.payload) {
        logFrame('RECV', frame.payload);
      }
    });
    ws.on('framesent', (frame) => {
      if (frame.payload) {
        logFrame('SENT', frame.payload);
      }
    });
  });

  function renderLog({ timestamp, category, name, details }) {
    const colors = {
      LISTENER_REGISTERED: '\x1b[33m', // Amarillo
      DOM_EVENT_TRIGGERED: '\x1b[31m\x1b[1m', // Rojo brillante
      WS_CLIENT_SEND: '\x1b[35m', // Magenta
      WS_CLIENT_RECV: '\x1b[34m', // Azul
      HTTP_FETCH: '\x1b[32m', // Verde
      NAVIGATOR_BEACON: '\x1b[41m\x1b[37m', // Fondo rojo
    };
    const reset = '\x1b[0m';
    const color = colors[category] || '\x1b[37m';

    console.log(
      `${color}[${timestamp}] [${category}] ${name}${reset}`,
      details ? JSON.stringify(details, null, 2) : ''
    );
  }

  function logFrame(direction, payload) {
    // Evitar ruido de pings/heartbeats vacíos
    if (payload === '2' || payload === '3' || payload === '{"type":"ping"}') return;
    const tag = direction === 'SENT' ? '\x1b[35m[WS >>> SENT]\x1b[0m' : '\x1b[34m[WS <<< RECV]\x1b[0m';
    console.log(`${tag} ${typeof payload === 'string' ? payload.substring(0, 300) : payload}`);
  }

  console.log(`Navegando a: ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  console.log('✅ Página cargada. Prueba interactuar con la ventana (minimizar, cambiar foco, etc.).');
}

main().catch(console.error);
