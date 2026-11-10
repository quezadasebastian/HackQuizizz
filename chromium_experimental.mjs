import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LAB_URL = process.env.LAB_URL || 'http://localhost:3000';
const PROFILE_DIR = path.join(__dirname, '.chromium-experimental-profile');
const RESULTS_FILE = path.join(__dirname, 'test_run_results.json');

async function runExperimentalSuite() {
  console.log('='.repeat(80));
  console.log('🧪 EJECUTOR CHROMIUM EXPERIMENTAL — PRUEBAS DETERMINISTAS CON CDP');
  console.log(`Perfil aislado: ${PROFILE_DIR}`);
  console.log(`URL de prueba: ${LAB_URL}`);
  console.log('='.repeat(80));

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  const testReport = {
    executionTimestamp: new Date().toISOString(),
    browserVersion: '',
    scenarios: [],
    cdpInterceptions: {
      networkRequests: [],
      lifecycleEvents: [],
      consoleEvents: [],
    },
    summary: { total: 0, passed: 0, failed: 0 },
  };

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());
  testReport.browserVersion = (await context.browser()?.version()) || 'Chromium CFT';

  // Sesión CDP de bajo nivel
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  cdp.on('Network.requestWillBeSent', (params) => {
    if (params.request.url.includes('/player-infraction') || params.request.url.includes('/api/telemetry')) {
      testReport.cdpInterceptions.networkRequests.push({
        timestamp: new Date().toISOString(),
        url: params.request.url,
        method: params.request.method,
        postData: params.request.postData || null,
      });
      console.log(`\x1b[36m[CDP NETWORK REQ]\x1b[0m ${params.request.method} ${params.request.url}`);
    }
  });

  cdp.on('Page.lifecycleEvent', (params) => {
    testReport.cdpInterceptions.lifecycleEvents.push({
      timestamp: new Date().toISOString(),
      name: params.name,
    });
  });

  cdp.on('Runtime.consoleAPICalled', (params) => {
    const text = params.args.map((a) => a.value || a.description || '').join(' ');
    testReport.cdpInterceptions.consoleEvents.push({
      timestamp: new Date().toISOString(),
      type: params.type,
      text,
    });
  });

  console.log(`Navegando al Laboratorio Local: ${LAB_URL}...`);
  await page.goto(LAB_URL, { waitUntil: 'networkidle' });

  async function fetchServerLogs() {
    const res = await page.request.get(`${LAB_URL}/api/logs`);
    return await res.json();
  }

  async function clearServerLogs() {
    await page.request.delete(`${LAB_URL}/api/logs`);
  }

  // Desactivar modal bloqueante inicial para permitir pruebas de componentes aislados
  await page.evaluate(() => {
    document.getElementById('cfgFocusMode').checked = false;
    updateConfig();
    updateFsUI();
  });

  // --- ESCENARIO 1: Pérdida rápida de foco (< 3000 ms - Grace Period) ---
  console.log('\n--- Ejecutando Escenario 1: Pérdida rápida de foco (< 3000ms) ---');
  await clearServerLogs();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(1200); // 1.2s < 3.0s
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(600);

  const logs1 = await fetchServerLogs();
  const pass1 = logs1.length === 0;
  testReport.scenarios.push({
    id: 'SCENARIO_1_QUICK_FOCUS_LOSS',
    name: 'Pérdida rápida de foco menor a 3000 ms (Grace Period comprobado)',
    expectedInfractions: 0,
    observedInfractions: logs1.length,
    passed: pass1,
    details: logs1,
  });
  console.log(`Resultado Escenario 1: ${pass1 ? '✅ PASÓ (0 infracciones)' : '❌ FALLÓ'}`);

  // --- ESCENARIO 2: Pérdida prolongada de foco (> 3000 ms) ---
  console.log('\n--- Ejecutando Escenario 2: Pérdida prolongada de foco (> 3000ms) ---');
  await clearServerLogs();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(3500); // 3.5s > 3.0s
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1000); // Esperar resolución de cola FIFO

  const logs2 = await fetchServerLogs();
  const types2 = logs2.map((l) => l.payload?.infractionType);
  const pass2 = types2.includes('playerExited') && types2.includes('playerResumed');
  testReport.scenarios.push({
    id: 'SCENARIO_2_PROLONGED_FOCUS_LOSS',
    name: 'Pérdida prolongada de foco mayor a 3000 ms (playerExited + playerResumed)',
    expectedInfractions: ['playerExited', 'playerResumed'],
    observedInfractions: types2,
    passed: pass2,
    details: logs2,
  });
  console.log(`Resultado Escenario 2: ${pass2 ? '✅ PASÓ (playerExited y playerResumed generados)' : '❌ FALLÓ'}`);

  // --- ESCENARIO 3: Detección y bloqueo de Clic Derecho ---
  console.log('\n--- Ejecutando Escenario 3: Clic Derecho ---');
  await clearServerLogs();
  await page.click('#rightClickZone', { button: 'right', force: true });
  await page.waitForTimeout(600);

  const logs3 = await fetchServerLogs();
  const types3 = logs3.map((l) => l.payload?.infractionType);
  const pass3 = types3.includes('rightClickDetected');
  testReport.scenarios.push({
    id: 'SCENARIO_3_RIGHT_CLICK',
    name: 'Prevención e infracción de clic derecho',
    expectedInfractions: ['rightClickDetected'],
    observedInfractions: types3,
    passed: pass3,
    details: logs3,
  });
  console.log(`Resultado Escenario 3: ${pass3 ? '✅ PASÓ (rightClickDetected generado)' : '❌ FALLÓ'}`);

  // --- ESCENARIO 4: Portapapeles (Paste) ---
  console.log('\n--- Ejecutando Escenario 4: Portapapeles (Paste) ---');
  await clearServerLogs();
  await page.focus('#pasteInput');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text', 'Respuesta de prueba copiada de internet');
    const pasteEvt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.dispatchEvent(pasteEvt);
  });
  await page.waitForTimeout(600);

  const logs4 = await fetchServerLogs();
  const types4 = logs4.map((l) => l.payload?.infractionType);
  const pass4 = types4.includes('pasteDetected');
  testReport.scenarios.push({
    id: 'SCENARIO_4_CLIPBOARD_PASTE',
    name: 'Intento de pegado con medición de longitud de texto',
    expectedInfractions: ['pasteDetected'],
    observedInfractions: types4,
    passed: pass4,
    details: logs4,
  });
  console.log(`Resultado Escenario 4: ${pass4 ? '✅ PASÓ (pasteDetected generado)' : '❌ FALLÓ'}`);

  // --- ESCENARIO 5: Redimensión de Ventana con Debounce ---
  console.log('\n--- Ejecutando Escenario 5: Redimensión de Ventana ---');
  await clearServerLogs();
  await page.setViewportSize({ width: 750, height: 600 });
  await page.waitForTimeout(800); // 800ms > debounce 500ms

  const logs5 = await fetchServerLogs();
  const types5 = logs5.map((l) => l.payload?.infractionType);
  const pass5 = types5.includes('windowResizeDetected') || types5.includes('googleLens');
  testReport.scenarios.push({
    id: 'SCENARIO_5_WINDOW_RESIZE',
    name: 'Redimensión de ventana con debounce de 500 ms',
    expectedInfractions: ['windowResizeDetected'],
    observedInfractions: types5,
    passed: pass5,
    details: logs5,
  });
  console.log(`Resultado Escenario 5: ${pass5 ? '✅ PASÓ (windowResizeDetected generado)' : '❌ FALLÓ'}`);

  // --- ESCENARIO 6: Salida de Pantalla Completa en Modo Foco ---
  console.log('\n--- Ejecutando Escenario 6: Salida de Pantalla Completa ---');
  await clearServerLogs();
  await page.evaluate(() => {
    document.getElementById('cfgFocusMode').checked = true;
    updateConfig();
    // Simular evento de salida de fullscreen
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await page.waitForTimeout(600);

  const logs6 = await fetchServerLogs();
  const types6 = logs6.map((l) => l.payload?.infractionType);
  const pass6 = types6.includes('fullscreenExitDetected');
  testReport.scenarios.push({
    id: 'SCENARIO_6_FULLSCREEN_EXIT',
    name: 'Salida de pantalla completa con focusMode activo',
    expectedInfractions: ['fullscreenExitDetected'],
    observedInfractions: types6,
    passed: pass6,
    details: logs6,
  });
  console.log(`Resultado Escenario 6: ${pass6 ? '✅ PASÓ (fullscreenExitDetected generado)' : '❌ FALLÓ'}`);

  // Consolidación de métricas
  testReport.summary.total = testReport.scenarios.length;
  testReport.summary.passed = testReport.scenarios.filter((s) => s.passed).length;
  testReport.summary.failed = testReport.summary.total - testReport.summary.passed;

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(testReport, null, 2), 'utf-8');
  console.log('\n' + '='.repeat(80));
  console.log(`🎯 PRUEBAS FINALIZADAS: ${testReport.summary.passed}/${testReport.summary.total} escenarios aprobados.`);
  console.log(`Informe persistido en: ${RESULTS_FILE}`);
  console.log('='.repeat(80));

  await context.close();
}

runExperimentalSuite().catch((err) => {
  console.error('Error durante la ejecución experimental:', err);
  process.exit(1);
});
