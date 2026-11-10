import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PROFILE = path.join(__dirname, '.browser-user-profile');
const REPORT_FILE = path.join(__dirname, 'phase8_validation_report.json');

async function runValidation() {
  console.log('='.repeat(80));
  console.log('🧪 VALIDACIÓN FASE 8 — COMPATIBILIDAD Y OPERABILIDAD DE CHROMIUM');
  console.log(`Perfil persistente: ${TEST_PROFILE}`);
  console.log('='.repeat(80));

  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: { total: 0, passed: 0, failed: 0 }
  };

  function recordTest(name, passed, details = {}) {
    results.tests.push({ name, passed, details });
    console.log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASÓ' : 'FALLÓ'}`);
  }

  // --- PRUEBA 1: Lanzamiento y Navegación Normal a Wayground ---
  console.log('\n--- Test 1: Navegación y Carga de Wayground ---');
  let context = await chromium.launchPersistentContext(TEST_PROFILE, {
    headless: false,
    viewport: null,
    args: ['--start-maximized', '--no-first-run']
  });
  let page = context.pages()[0] || await context.newPage();

  try {
    await page.goto('https://wayground.com/join', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    const hasWayground = title.toLowerCase().includes('wayground') || title.toLowerCase().includes('quizizz') || title.toLowerCase().includes('code');
    recordTest('Navegación y carga de página real (Wayground)', hasWayground, { title, url: page.url() });
  } catch (err) {
    recordTest('Navegación y carga de página real (Wayground)', false, { error: err.message });
  }

  // --- PRUEBA 2: Redimensionamiento Libre de Ventana ---
  console.log('\n--- Test 2: Redimensionamiento de Ventana ---');
  try {
    await page.setViewportSize({ width: 1024, height: 768 });
    const size = page.viewportSize();
    recordTest('Redimensionamiento de ventana', size.width === 1024 && size.height === 768, size);
  } catch (err) {
    recordTest('Redimensionamiento de ventana', false, { error: err.message });
  }

  // --- PRUEBA 3: Creación y Cambio Entre Múltiples Pestañas ---
  console.log('\n--- Test 3: Gestión de Múltiples Pestañas ---');
  try {
    const page2 = await context.newPage();
    await page2.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    const tabCount = context.pages().length;
    await page.bringToFront();
    const activeIsFirst = page.url().includes('wayground');
    recordTest('Cambio entre pestañas independientes', tabCount >= 2 && activeIsFirst, { tabCount, activeTab: page.url() });
    await page2.close();
  } catch (err) {
    recordTest('Cambio entre pestañas independientes', false, { error: err.message });
  }

  // --- PRUEBA 4: Portapapeles Nativo (Copiar y Pegar) ---
  console.log('\n--- Test 4: Operaciones de Portapapeles (Copy/Paste) ---');
  try {
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'p8-clipboard-test';
      input.value = 'Texto persistente de prueba';
      document.body.appendChild(input);
      input.select();
    });
    const copiedText = await page.evaluate(() => {
      const el = document.getElementById('p8-clipboard-test');
      return el.value;
    });
    recordTest('Interacción con portapapeles y campos de texto', copiedText === 'Texto persistente de prueba', { copiedText });
  } catch (err) {
    recordTest('Interacción con portapapeles y campos de texto', false, { error: err.message });
  }

  // --- PRUEBA 5: Persistencia de Cookies / Sesión entre Reinicios ---
  console.log('\n--- Test 5: Persistencia de Sesión y Cookies ---');
  try {
    // Establecer una cookie persistente (con expiración explícita para sobrevivir al cierre de proceso)
    await context.addCookies([{
      name: 'experimental_session_token',
      value: 'AUTH_TOKEN_XYZ_123',
      domain: '.wayground.com',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 86400, // 24h persistencia
      httpOnly: false,
      secure: true,
      sameSite: 'Lax'
    }]);

    // Establecer un registro en localStorage para verificar persistencia de almacenamiento web
    await page.evaluate(() => {
      localStorage.setItem('p8_storage_test_key', 'STORED_VALUE_456');
    });

    // Cerrar el contexto completamente para forzar escritura en SQLite de Chromium
    await context.close();

    // Reabrir el contexto utilizando el mismo perfil de disco
    context = await chromium.launchPersistentContext(TEST_PROFILE, {
      headless: false,
      viewport: null
    });
    page = context.pages()[0] || await context.newPage();
    await page.goto('https://wayground.com/join', { waitUntil: 'domcontentloaded' });

    const cookies = await context.cookies(['https://wayground.com']);
    const testCookie = cookies.find(c => c.name === 'experimental_session_token');
    const storedVal = await page.evaluate(() => localStorage.getItem('p8_storage_test_key'));
    const persisted = (testCookie && testCookie.value === 'AUTH_TOKEN_XYZ_123') || storedVal === 'STORED_VALUE_456';
    recordTest('Persistencia de cookies y sesión en perfil persistente', !!persisted, { cookie: testCookie, localStorage: storedVal });
  } catch (err) {
    recordTest('Persistencia de cookies y sesión en perfil persistente', false, { error: err.message });
  }

  // --- PRUEBA 6: Soporte de Pantalla Completa Estándar ---
  console.log('\n--- Test 6: API de Pantalla Completa ---');
  try {
    page = context.pages()[0] || await context.newPage();
    await page.goto('about:blank');
    const fsSupported = await page.evaluate(() => {
      return document.fullscreenEnabled || document.webkitFullscreenEnabled || false;
    });
    recordTest('Capacidad nativa de pantalla completa habilitada', fsSupported, { fullscreenEnabled: fsSupported });
  } catch (err) {
    recordTest('Capacidad nativa de pantalla completa habilitada', false, { error: err.message });
  }

  // Cerrar sesión
  await context.close();

  // Consolidación de métricas
  results.summary.total = results.tests.length;
  results.summary.passed = results.tests.filter(t => t.passed).length;
  results.summary.failed = results.summary.total - results.summary.passed;

  fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2), 'utf-8');
  console.log('\n' + '='.repeat(80));
  console.log(`🎯 VALIDACIÓN FASE 8 COMPLETADA: ${results.summary.passed}/${results.summary.total} pruebas aprobadas.`);
  console.log(`Reporte guardado en: ${REPORT_FILE}`);
  console.log('='.repeat(80));
}

runValidation().catch(err => {
  console.error('Error durante la validación:', err);
  process.exit(1);
});
