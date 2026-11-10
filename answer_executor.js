/**
 * Executes the answer on the page:
 * - If there is an input field (or virtual math calculator input), types the text and clicks "Enviar".
 * - If there are multiple choice options, clicks the matching element.
 */
export async function submitAnswer(page, answerText) {
  if (!answerText) return;

  try {
    // 1. Verificar si hay un input visible (caja de texto, input matemático o teclado virtual)
    const inputSelector = 'input[type="text"], input:not([type="hidden"]), textarea, [contenteditable="true"], .math-input, .mq-editable-field, [class*="text-input"]';
    const inputElem = await page.$(inputSelector);

    if (inputElem) {
      await inputElem.click().catch(() => {});
      await inputElem.fill(answerText).catch(async () => {
        // Fallback para campos contenteditable o MathQuill
        await page.keyboard.type(answerText, { delay: 50 });
      });

      // Presionar Enter o dar clic en el botón "Enviar" / "Submit"
      await page.keyboard.press('Enter').catch(() => {});
      const submitBtn = await page.$('button:has-text("Enviar"), button:has-text("Submit"), button[data-testid*="submit"]');
      if (submitBtn) {
        await submitBtn.click().catch(() => {});
      }
      await page.waitForTimeout(1000);
      return;
    }

    // 2. Si no es de input, tratar como opción múltiple
    const escaped = answerText.replace(/"/g, '\\"');
    const selectorExact = `//*[contains(@class, 'option') and normalize-space(.)="${escaped}"]`;
    const selectorContains = `//*[contains(@class, 'option') and contains(normalize-space(.), "${escaped}")]`;

    let elementHandle = await page.$(selectorExact) || await page.$(selectorContains);

    if (!elementHandle) {
      elementHandle = await page.$(`button:has-text("${escaped}")`);
    }

    if (elementHandle) {
      await elementHandle.click({ timeout: 5000 }).catch(() => {});
    }

    await page.waitForTimeout(500);
  } catch (err) {
    console.warn('Error al enviar respuesta:', err.message);
  }
}
