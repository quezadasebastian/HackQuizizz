import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio seguro para almacenar perfiles de navegación, cookies y sesiones reales
const PROFILE_DIR = path.join(__dirname, '.browser-user-profile');
const LOG_FILE = path.join(__dirname, 'session_audit.jsonl');

// URL inicial (parámetro o predeterminada)
const initialUrl = process.argv.find(arg => arg.startsWith('http://') || arg.startsWith('https://')) || 'https://wayground.com/join';
const enableDiagnostics = process.argv.includes('--diagnostics') || process.argv.includes('--log');

async function launchBrowser() {
  console.log('='.repeat(80));
  console.log('🌐 NAVEGADOR EXPERIMENTAL CHROMIUM — FASE 8');
  console.log(`Perfil de usuario: ${PROFILE_DIR}`);
  console.log(`URL de inicio:     ${initialUrl}`);
  console.log(`Diagnóstico pasivo: ${enableDiagnostics ? 'HABILITADO (Solo lectura)' : 'DESACTIVADO (Navegación pura)'}`);
  console.log('='.repeat(80));

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  // Lanzamiento de Chromium con interfaz de usuario nativa y perfil persistente
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null, // Permite control nativo del gestor de ventanas del sistema operativo
    args: [
      '--start-maximized',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  // Registro de auditoría local (Solo lectura, sin inyección ni alteración de scripts)
  if (enableDiagnostics) {
    console.log('[DIAGNÓSTICO] Adjuntando observador pasivo de eventos del navegador...');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');

    const logAuditEvent = (eventType, details = {}) => {
      const entry = {
        timestamp: new Date().toISOString(),
        eventType,
        url: page.url(),
        details,
      };
      fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
      console.log(`\x1b[36m[AUDITORÍA LOCAL]\x1b[0m [${entry.timestamp.split('T')[1].replace('Z','')}] ${eventType}:`, details);
    };

    cdp.on('Page.lifecycleEvent', (params) => {
      logAuditEvent('PAGE_LIFECYCLE', { name: params.name });
    });

    page.on('domcontentloaded', () => logAuditEvent('DOM_CONTENT_LOADED', { url: page.url() }));
    page.on('load', () => logAuditEvent('PAGE_LOADED', { url: page.url() }));
  }

  console.log(`Navegando a: ${initialUrl}...`);
  await page.goto(initialUrl).catch(err => console.warn('Navegación inicial:', err.message));

  console.log('\n✅ Navegador operativo con ventana gráfica completa.');
  console.log('💡 Puedes navegar, cambiar pestañas, redimensionar y autenticarte normalmente.');
  console.log('Para finalizar, simplemente cierra la ventana del navegador.\n');

  // Mantener el proceso vivo hasta que el usuario cierre la ventana del navegador
  context.on('close', () => {
    console.log('\n[NAVEGADOR CERRADO] Sesión y cookies guardadas correctamente en el perfil.');
    process.exit(0);
  });
}

launchBrowser().catch(err => {
  console.error('Error al iniciar el navegador experimental:', err);
  process.exit(1);
});
