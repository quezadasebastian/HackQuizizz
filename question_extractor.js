/**
 * Extracts the current question and its options from a Wayground/Quizizz quiz page.
 * Utiliza selectores ampliados y heurísticas de la UI de Quizizz / Wayground.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<null|{questionId:string, text:string, options:Array<string>}>>}
 */
export async function extractQuestion(page) {
  try {
    const data = await page.evaluate(() => {
      // 1. Buscar enunciado de la pregunta (Wayground / Quizizz usan data-testid, data-cy, class o etiquetas semánticas)
      const qSelectors = [
        '[data-testid="question-container-text"]',
        '[data-cy="question-text"]',
        '.question-text-color',
        '.question-text',
        '.theme-typography-title',
        '[class*="question-text"]',
        '[class*="questionText"]',
        'p[id*="question"]',
        '.resizeable-question-text',
        '.resizeable-text',
        '#question-text',
      ];

      let qElem = null;
      for (const sel of qSelectors) {
        const found = document.querySelector(sel);
        if (found && found.innerText && found.innerText.trim().length > 0) {
          qElem = found;
          break;
        }
      }

      // 1. Enunciado: limpiar prefijos residuales del DOM de Wayground ("Texto de la pregunta:")
      const rawText = qElem ? qElem.innerText.trim() : '';
      const text = rawText.replace(/^Texto de la pregunta:\s*/i, '').trim();

      // Función para limpiar el número de atajo ("1", "2", "3", "4") al final de cada tarjeta de opción
      const cleanOptionText = (str) => {
        return str.replace(/\n+\d+\s*$/, '').replace(/\s+/g, ' ').trim();
      };

      // 2. Buscar opciones de respuesta
      const optSelectors = [
        '[data-testid*="option"]',
        '[data-cy*="option"]',
        '[data-testid*="choice"]',
        '.option-box',
        '.option-container',
        '[class*="option-container"]',
        '[class*="optionText"]',
        '[class*="option_"]',
        '[class*="choice_"]',
        '.choice-text',
        '.option',
        'button[class*="option"]',
        '[role="radio"]',
        '.answer-text',
        '.option-inner',
        '[class*="option-holder"]',
        '[class*="theme-typography-body"]',
      ];

      let options = [];
      for (const sel of optSelectors) {
        const founds = Array.from(document.querySelectorAll(sel));
        const texts = founds
          .map(el => el.innerText ? cleanOptionText(el.innerText) : '')
          .filter(t => t.length > 0 && t !== text && t !== rawText);
        if (texts.length >= 2 && texts.length <= 8) {
          options = texts;
          break;
        }
      }

      // Fallback: Si Quizizz usa botones o divs con número de opción (1, 2, 3, 4)
      if (options.length === 0) {
        const allElements = Array.from(document.querySelectorAll('button, div[tabindex], [role="button"], [class*="card"]'));
        const plausible = [];
        for (const el of allElements) {
          const t = el.innerText ? cleanOptionText(el.innerText) : '';
          if (t && t !== text && t !== rawText && t.length > 1 && t.length < 300 && el.clientHeight > 40 && el.clientWidth > 80) {
            plausible.push(t);
          }
        }
        const unique = Array.from(new Set(plausible));
        if (unique.length >= 2 && unique.length <= 6) {
          options = unique;
        }
      }

      // 3. Detectar si la pregunta requiere entrada de texto/fórmula (ej: Math input / teclado virtual / calculadora)
      // SOLO considerar entrada de texto si NO se encontraron opciones de selección múltiple
      let hasInput = false;
      if (options.length === 0) {
        const inputSelectors = [
          'input[type="text"]',
          'textarea',
          '.math-input',
          '.mq-editable-field',
          '[class*="mathquill"]',
        ];
        for (const sel of inputSelectors) {
          const inp = document.querySelector(sel);
          if (inp && inp.offsetParent !== null) { // visible
            hasInput = true;
            break;
          }
        }
      }

      return {
        url: window.location.href,
        hasQuestion: Boolean(text),
        hasInput,
        text,
        options,
      };
    });

    if (!data || !data.text || (data.options.length === 0 && !data.hasInput)) {
      return null;
    }

    return {
      questionId: `q-${Date.now()}`,
      text: data.text,
      hasInput: data.hasInput,
      options: data.options,
    };
  } catch (err) {
    return null;
  }
}
