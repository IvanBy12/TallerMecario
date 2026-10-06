import type { Locator } from '@playwright/test';

/**
 * Introduce un valor sensible (contraseña, código de verificación, correo) en un <input> SIN que el valor pase por el título
 * de una acción, el call log, un `Error` ni ningún reporter de Playwright.
 *
 * Por qué no `fill()` / `type()` / `press()`: Playwright incluye el argumento en el título del paso (`Fill "valor"`) y en el
 * call log de los errores (`- fill("valor")`), y de ahí pasa a los reportes (list, html, json, junit). Aquí la acción visible es
 * únicamente `locator.evaluate` y el valor viaja como argumento serializado hacia el navegador; la función del navegador nunca lo
 * devuelve, nunca lo incluye en un mensaje y captura toda excepción propia (un `catch` que solo devuelve un código fijo).
 *
 * Equivalencia con una entrada real (verificada contra un formulario local en e2e-harness-tests/browser):
 *  - foco en el campo;
 *  - el valor se asigna con el setter NATIVO de HTMLInputElement.prototype (así el rastreador de valor de React detecta el
 *    cambio, como ocurre con el teclado) y no con `el.value = …` sobre la instancia;
 *  - eventos `input` (InputEvent, bubbles) y `change` (bubbles) → React/Clerk reciben el cambio;
 *  - se comprueba dentro del navegador que el valor quedó aplicado y solo se devuelve un código fijo.
 */

export type SecretEntryOutcome = 'ok' | 'not-input' | 'not-editable' | 'setter-missing' | 'entry-threw' | 'value-mismatch';

const FAILURE_TEXT: Readonly<Record<Exclude<SecretEntryOutcome, 'ok'>, string>> = {
  'not-input': 'el elemento no es un <input>',
  'not-editable': 'el campo está deshabilitado o es de solo lectura',
  'setter-missing': 'el navegador no expone el setter nativo del input',
  'entry-threw': 'la página lanzó una excepción al recibir el valor',
  'value-mismatch': 'el campo no conservó el valor introducido',
};

/** Error con mensaje FIJO: no recibe ni conserva ningún dato de la entrada ni la causa original. */
export class SecretEntryError extends Error {
  constructor(readonly outcome: Exclude<SecretEntryOutcome, 'ok'>) {
    super(`No se pudo introducir la credencial en el campo: ${FAILURE_TEXT[outcome]}.`);
    this.name = 'SecretEntryError';
  }
}

/** Se ejecuta DENTRO del navegador (Playwright la serializa con toString): debe ser autocontenida. */
function assignInputValueInBrowser(element: Element, value: string): SecretEntryOutcome {
  try {
    if (!(element instanceof HTMLInputElement)) return 'not-input';
    if (element.disabled || element.readOnly) return 'not-editable';
    element.focus();
    // Reflect.set con receptor = el input invoca el setter NATIVO del prototipo (no el rastreador de valor de la instancia).
    if (!Reflect.set(HTMLInputElement.prototype, 'value', value, element)) return 'setter-missing';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.value === value ? 'ok' : 'value-mismatch';
  } catch {
    return 'entry-threw';
  }
}

export async function enterSecret(field: Locator, value: string, timeout = 20_000): Promise<void> {
  const outcome = await field.evaluate(assignInputValueInBrowser, value, { timeout });
  if (outcome !== 'ok') {
    throw new SecretEntryError(outcome);
  }
}
