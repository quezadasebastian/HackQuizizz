import { initBrowser } from './browser_manager.js';
import { extractQuestion } from './question_extractor.js';
import { analyzeQuestion } from './reasoning_engine.js';
import { submitAnswer } from './answer_executor.js';
import { notifyAnswer } from './notifier.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_PATH = path.join(__dirname, 'automation_report.md');
const ENV_PATH = path.join(__dirname, '.env');
let reportLines = [];

function addReport(line) {
  const ts = new Date().toISOString();
  reportLines.push(`${ts} - ${line}`);
}

/**
 * Carga y actualiza el archivo .env
 */
function readEnvConfig() {
  const config = {
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-3.5-flash-lite',
    NOTIFICATION_CHANNEL: 'hud',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    AUTO_CLICK: 'false',
  };

  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...v] = trimmed.split('=');
      if (k && v) {
        config[k.trim()] = v.join('=').trim();
        process.env[k.trim()] = config[k.trim()];
      }
    }
  }
  return config;
}

function saveEnvConfig(config) {
  const content = [
    '# Clave de API de Google Gemini (Obtenida gratis en https://aistudio.google.com/apikey)',
    `GEMINI_API_KEY=${config.GEMINI_API_KEY}`,
    '',
    '# Configuración del modelo y canales (hud | telegram | both)',
    `GEMINI_MODEL=${config.GEMINI_MODEL || 'gemini-3.5-flash-lite'}`,
    `NOTIFICATION_CHANNEL=${config.NOTIFICATION_CHANNEL || 'hud'}`,
    `TELEGRAM_BOT_TOKEN=${config.TELEGRAM_BOT_TOKEN || ''}`,
    `TELEGRAM_CHAT_ID=${config.TELEGRAM_CHAT_ID || ''}`,
    `AUTO_CLICK=${config.AUTO_CLICK || 'false'}`,
  ].join('\n');
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
  Object.assign(process.env, config);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((res) => rl.question(q, (ans) => res(ans.trim())));

async function showInteractiveMenu() {
  const config = readEnvConfig();

  while (true) {
    console.clear();
    const maskedKey = config.GEMINI_API_KEY && config.GEMINI_API_KEY.length > 10
      ? `${config.GEMINI_API_KEY.slice(0, 6)}...${config.GEMINI_API_KEY.slice(-4)} (Configurada ✅)`
      : '❌ NO CONFIGURADA';

    console.log('======================================================================');
    console.log('   🚀 COPILOTO AUTÓNOMO DE EVALUACIÓN — CHROMIUM WAYGROUND (FASE 8)');
    console.log('======================================================================');
    console.log(` 🔑 API Key Gemini : ${maskedKey}`);
    console.log(` 📡 Canal Alerta   : ${config.NOTIFICATION_CHANNEL.toUpperCase()} (hud = Ventana Sin Foco | telegram = Bot)`);
    console.log(` 🖱️  Auto-Click     : ${config.AUTO_CLICK === 'true' ? 'ACTIVADO' : 'SOLO NOTIFICAR (Tú marcas)'}`);
    console.log('----------------------------------------------------------------------');
    console.log(' [1] ▶️  ABRIR NAVEGADOR (Modo Espera — Sin gastar tokens)');
    console.log(' [2] 🔑 Configurar / Cambiar API Key de Gemini');
    console.log(' [3] 📡 Cambiar Canal de Salida (1: HUD Flotante Sin Foco | 2: Telegram | 3: Ambos)');
    console.log(' [4] 🖱️  Alternar Auto-Click (Marcar solo vs Solo avisar por HUD/Telegram)');
    console.log(' [5] ❌ Salir');
    console.log('======================================================================');

    const opt = await ask('\n👉 Selecciona una opción (1-5): ');

    if (opt === '1') {
      break;
    } else if (opt === '2') {
      const newKey = await ask('Pegue su nueva GEMINI_API_KEY: ');
      if (newKey) {
        config.GEMINI_API_KEY = newKey;
        saveEnvConfig(config);
        console.log('✅ API Key guardada en .env');
        await new Promise(r => setTimeout(r, 1000));
      }
    } else if (opt === '3') {
      console.log('\nCanales disponibles:');
      console.log('  1 = HUD Flotante Win32 (No roba foco ni sale de pantalla completa)');
      console.log('  2 = Bot de Telegram (Llega a tu celular)');
      console.log('  3 = Ambos al mismo tiempo');
      const ch = await ask('Elige canal (1/2/3): ');
      if (ch === '1') config.NOTIFICATION_CHANNEL = 'hud';
      if (ch === '2' || ch === '3') {
        config.NOTIFICATION_CHANNEL = ch === '2' ? 'telegram' : 'both';
        const token = await ask(`Token del Bot de Telegram (${config.TELEGRAM_BOT_TOKEN || 'vacío'}): `);
        const chat = await ask(`Chat ID de Telegram (${config.TELEGRAM_CHAT_ID || 'vacío'}): `);
        if (token) config.TELEGRAM_BOT_TOKEN = token;
        if (chat) config.TELEGRAM_CHAT_ID = chat;
      }
      saveEnvConfig(config);
      console.log('✅ Canal actualizado en .env');
      await new Promise(r => setTimeout(r, 1000));
    } else if (opt === '4') {
      config.AUTO_CLICK = config.AUTO_CLICK === 'true' ? 'false' : 'true';
      saveEnvConfig(config);
    } else if (opt === '5') {
      process.exit(0);
    }
  }
}

(async () => {
  await showInteractiveMenu();

  console.log('\n🌐 Abriendo navegador Chromium...');
  const { context, page } = await initBrowser();
  addReport('Navegador iniciado y página cargada');

  context.on('close', () => {
    console.log('\n[NAVEGADOR CERRADO] Guardando reporte y cerrando sesión.');
    fs.writeFileSync(REPORT_PATH, reportLines.join('\n'), 'utf-8');
    process.exit(0);
  });

  // Control de estado de captura para no gastar tokens antes de que inicie el cuestionario
  let captureActive = false;

  console.log('\n======================================================================');
  console.log('⏸️  MODO ESPERA ACTIVO (0 consumo de tokens).');
  console.log('   1. Inicia sesión e ingresa al cuestionario en la ventana de Chromium.');
  console.log('   2. Cuando estés listo para que la IA empiece a leer las preguntas,');
  console.log('      presiona [ENTER] o escribe "1" aquí en la consola.');
  console.log('      (Puedes volver a presionar [ENTER] en cualquier momento para PAUSAR).');
  console.log('======================================================================\n');

  // Escuchar ENTER o "1" en segundo plano para activar/pausar la captura en vivo
  rl.on('line', (input) => {
    captureActive = !captureActive;
    if (captureActive) {
      console.log('\n🟢 [CAPTURA ACTIVADA] — Leyendo preguntas en tiempo real. Puedes ir a Pantalla Completa.');
      notifyAnswer('Copiloto Activado', 'Lectura de preguntas en curso (Sin robo de foco)');
    } else {
      console.log('\n🟡 [CAPTURA EN PAUSA] — No se consumirán tokens hasta que presiones ENTER.');
    }
  });

  let questionIndex = 0;
  let lastSeenQuestion = '';

  while (!context.pages().every(p => p.isClosed())) {
    try {
      if (!captureActive) {
        await page.waitForTimeout(1000);
        continue;
      }

      const activePage = context.pages().find(p => !p.isClosed()) || page;
      const questionData = await extractQuestion(activePage);

      if (questionData && questionData.text && questionData.text !== lastSeenQuestion) {
        lastSeenQuestion = questionData.text;
        questionIndex++;
        addReport(`Pregunta ${questionIndex}: ${questionData.text.trim().slice(0, 60)}...`);

        console.log(`\n============================================================`);
        console.log(`[PREGUNTA ${questionIndex}]`, questionData.text.trim());
        if (questionData.options && questionData.options.length > 0) {
          console.log('Opciones detectadas:');
          questionData.options.forEach((o, i) => console.log(`  ${i + 1}. ${o.replace(/\n/g, ' ').slice(0, 70)}`));
        }
        console.log(`============================================================`);

        const { choice, confidence, rationale } = await analyzeQuestion(
          questionData.text,
          questionData.options,
          questionData.hasInput
        );

        if (!choice || confidence < 0.7) {
          addReport(`🤖 Decisión: No responder (confianza ${confidence?.toFixed(2) || 'N/A'})`);
          console.log(`[DECISIÓN] Confianza insuficiente (${confidence}): No se sugiere respuesta.`);
          await notifyAnswer(`Pregunta ${questionIndex}`, '⚠️ Confianza baja: Revisa manualmente');
        } else {
          const cleanChoice = choice.replace(/\n+/g, ' ').trim();
          addReport(`🤖 Decisión: Elegir "${cleanChoice}" (confianza ${confidence.toFixed(2)})`);
          console.log(`\n💡 [RESPUESTA IA]: "${cleanChoice}" (Confianza: ${(confidence * 100).toFixed(0)}%)`);
          console.log(`📝 [JUSTIFICACIÓN]: ${rationale}\n`);

          // Enviar a HUD pasivo sin foco y/o Telegram
          await notifyAnswer(
            `Pregunta ${questionIndex}`,
            `👉 Marcar: ${cleanChoice.slice(0, 85)}`
          );

          if (process.env.AUTO_CLICK === 'true') {
            await submitAnswer(activePage, choice);
            addReport('✅ Auto-Click enviado');
          }
        }

        await activePage.waitForTimeout(1500);
      } else {
        await activePage.waitForTimeout(1000);
      }
    } catch (err) {
      await page.waitForTimeout(1000).catch(() => {});
    }
  }

  fs.writeFileSync(REPORT_PATH, reportLines.join('\n'), 'utf-8');
})();
