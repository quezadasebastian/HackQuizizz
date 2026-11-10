import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Recrear __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio de perfil persistente (seguro y aislado)
const PROFILE_DIR = path.join(__dirname, '.browser-user-profile');
const LOG_FILE = path.join(__dirname, 'session_audit.jsonl');

/**
 * Inicializa Chromium con perfil persistente y modo diagnóstico activo.
 * @returns {{context: any, page: any, cdp: any, logAuditEvent: Function}}
 */
export async function initBrowser(initialUrl = 'https://wayground.com/join') {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
  // Lanzamiento de Chromium alineado con browser_runner.mjs probado en Fase 8
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null, // Permite control nativo del gestor de ventanas del SO
    chromiumSandbox: true, // Sandbox activo para evitar la alerta de --no-sandbox
    args: [
      '--start-maximized',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  // CDP session para auditoría pasiva
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  
  // Registrar eventos de ciclo de vida
  cdp.on('Page.lifecycleEvent', (params) => {
    logAuditEvent('PAGE_LIFECYCLE', { name: params.name });
  });

  page.on('domcontentloaded', () => logAuditEvent('DOM_CONTENT_LOADED', { url: page.url() }));
  page.on('load', () => logAuditEvent('PAGE_LOADED', { url: page.url() }));

  // Función interna para escribir en el log
  function logAuditEvent(eventType, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      eventType,
      url: page.url(),
      details,
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  }

  console.log('Navegando a:', initialUrl);
  await page.goto(initialUrl, { waitUntil: 'domcontentloaded' }).catch((e) =>
    console.warn('Nav error:', e.message)
  );

  return { context, page, cdp, logAuditEvent };
}

/**
 * Cierra el navegador y finaliza el proceso.
 */
export async function closeBrowser(context) {
  await context.close();
  console.log('Navegador cerrado');
}