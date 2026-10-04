import { LoginFailure, signInThroughUi } from '../../../e2e/support/clerk-login';
import { expect, syntheticCredentials, test } from '../fixtures';

/**
 * El login real (e2e/support/clerk-login.ts) contra un formulario LOCAL que imita a Clerk, con credenciales sintéticas.
 * Las pruebas con prefijo «[forced-failure]» FALLAN a propósito para que el error llegue a todos los reporters; el test de
 * Vitest que lanza este suite comprueba que fallan con el mensaje sanitizado y que ningún canal contiene el marcador.
 * Ningún `expect` recibe el secreto como argumento (el mensaje de un expect fallido lo imprimiría).
 */

test.describe('login exitoso', () => {
  test('un paso: valor aplicado, eventos input/change con bubbles y submit real', async ({ page, fakeClerk }) => {
    await signInThroughUi(page, syntheticCredentials(), null);
    await expect(page.locator('main#contenido-principal')).toBeVisible();
    const check = fakeClerk.checks.at(-1);
    expect(check?.identifierMatched, 'el servidor recibió el identificador').toBe(true);
    expect(check?.passwordMatched, 'el servidor recibió exactamente la contraseña (estado alimentado por eventos input)').toBe(true);
    const events = await page.evaluate(() => Reflect.get(window, '__fakeClerk') as { events: string[] });
    expect(events.events).toEqual(expect.arrayContaining(['identifier:input:true', 'identifier:change:true', 'password:input:true', 'password:change:true']));
  });

  test.describe('contraseña en un segundo paso', () => {
    test.use({ clerkMode: 'two-step' });
    test('Continue → contraseña → submit real', async ({ page, fakeClerk }) => {
      await signInThroughUi(page, syntheticCredentials(), null);
      await expect(page.locator('main#contenido-principal')).toBeVisible();
      expect(fakeClerk.checks.at(-1)?.passwordMatched).toBe(true);
    });
  });
});

test.describe('errores sanitizados', () => {
  test.describe('página hostil: lanza una excepción CON el valor al recibirlo', () => {
    test.use({ clerkMode: 'hostile-setter' });
    test('LoginFailure con mensaje fijo, sin cause y sin el valor', async ({ page }) => {
      const error = await signInThroughUi(page, syntheticCredentials(), null).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(LoginFailure);
      expect((error as LoginFailure).cause).toBeUndefined();
      const serialized = JSON.stringify({ message: (error as LoginFailure).message, stack: (error as LoginFailure).stack, own: Object.entries(error as object) });
      expect(serialized.includes(syntheticCredentials().password), 'el error serializado contiene la contraseña').toBe(false);
      expect(serialized).toContain('paso «contraseña»');
      expect(page.url()).toBe('about:blank');
    });
  });
});

test.describe('[forced-failure] el error llega a los reporters sin el secreto', () => {
  test.describe('contraseña rechazada por Clerk', () => {
    test.use({ clerkMode: 'wrong-password' });
    test('[forced-failure] contraseña rechazada', async ({ page }) => {
      await signInThroughUi(page, syntheticCredentials(), null);
    });
  });

  test.describe('excepción al introducir la credencial', () => {
    test.use({ clerkMode: 'hostile-setter' });
    test('[forced-failure] excepción durante la introducción', async ({ page }) => {
      await signInThroughUi(page, syntheticCredentials(), null);
    });
  });

  test.describe('campo de contraseña inexistente', () => {
    test.use({ clerkMode: 'no-password-field' });
    test('[forced-failure] timeout esperando el campo', async ({ page }) => {
      await signInThroughUi(page, syntheticCredentials(), null, { fieldTimeoutMs: 1_500, resultTimeoutMs: 1_500 });
    });
  });
});
