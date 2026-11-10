import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde .env manualmente sin dependencias externas
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...v] = trimmed.split('=');
      const val = v.join('=').trim();
      if (k && val) {
        process.env[k.trim()] = val;
      }
    }
  }
}

/**
 * Analiza la pregunta mediante la API de Google Gemini.
 * @param {string} questionText Texto de la pregunta.
 * @param {Array<string>} options Lista de opciones en texto.
 * @param {boolean} hasInput Indica si la pregunta es de campo de texto / calculadora.
 * @returns {Promise<{choice:string, confidence:number, rationale:string}>}
 */
export async function analyzeQuestion(questionText, options = [], hasInput = false) {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'PEGA_AQUI_TU_API_KEY' || apiKey.length < 15) {
    console.warn('\n⚠️ [AVISO] No has configurado tu GEMINI_API_KEY. Usa la opción [2] del menú inicial.');
    return {
      choice: null,
      confidence: 0,
      rationale: 'API Key no configurada.',
    };
  }

  console.log('\n🤖 Consultando a Gemini API en tiempo real...');
  return await callGeminiDirect(questionText, options, hasInput, apiKey);
}

/**
 * Conexión directa a la API de Gemini con limpieza de JSON y reintentos automáticos
 */
async function callGeminiDirect(questionText, options, hasInput, apiKey) {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let prompt = '';
      if (hasInput || !options || options.length === 0) {
        prompt = `Resuelve la siguiente pregunta de examen y proporciona la respuesta exacta y breve.
Pregunta: ${questionText}

Responde únicamente con un objeto JSON válido:
{"answer": "<respuesta_exacta>", "confidence": 0.99, "rationale": "<breve explicacion>"}`;
      } else {
        prompt = `Actúa como un experto resolviendo un examen de opción múltiple.
Pregunta: ${questionText}

Opciones disponibles:
${options.map((o, i) => `[Índice ${i}]: ${o}`).join('\n')}

Selecciona el índice (0 a ${options.length - 1}) de la respuesta correcta.
Responde únicamente con un objeto JSON válido:
{"choiceIndex": <numero_entero>, "confidence": 0.99, "rationale": "<breve explicacion>"}`;
      }

      const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      const data = await res.json();

      if (data.error) {
        console.warn(`[Intento ${attempt}/${maxRetries}] API aviso (${data.error.code}): ${data.error.message}`);
        await new Promise(r => setTimeout(r, 800 * attempt));
        continue;
      }

      let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        rawText = jsonMatch[0];
      }

      const parsed = JSON.parse(rawText);

      let choice = null;
      if (hasInput || !options || options.length === 0) {
        choice = String(parsed.answer || parsed.choice || '');
      } else {
        let idx = Number(parsed.choiceIndex);
        if (isNaN(idx) || idx < 0 || idx >= options.length) {
          idx = 0;
        }
        const optNum = idx + 1;
        choice = `[Opción ${optNum}] ${options[idx]}`;
      }

      return {
        choice,
        confidence: Number(parsed.confidence) || 0.95,
        rationale: parsed.rationale || 'Respuesta generada por Gemini API',
      };
    } catch (err) {
      console.warn(`[Intento ${attempt}/${maxRetries}] Fallo al procesar respuesta:`, err.message);
      await new Promise(r => setTimeout(r, 700));
    }
  }

  return {
    choice: options?.[0] ? `[Opción 1] ${options[0]}` : null,
    confidence: 0.75,
    rationale: 'Fallback tras reintentos de red.',
  };
}
