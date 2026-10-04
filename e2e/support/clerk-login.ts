import { expect, type Page } from '@playwright/test';

import type { Credentials } from './env';

/**
 * Login REAL a través del componente <SignIn/> embebido de Clerk en /login (src/features/auth/clerk-session.tsx).
 * No se usa @clerk/testing ni ticket de backend: no requieren dependencias nuevas ni la secret key de Clerk en el runner.
 *
 * Los selectores de Clerk (`input[name=identifier]`, `input[name=password]`, botón «Continue») son los del SDK en inglés
 * por defecto y NO se han ejecutado contra una instancia real en este repositorio (ver docs/quality/s3-mobile-e2e.md).
 */

const SHELL = 'main#contenido-principal';

async function clickContinue(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^continue$/i }).click();
}

export async function expectWorkshopShell(page: Page): Promise<void> {
  await expect(page.locator(SHELL)).toBeVisible({ timeout: 60_000 });
}

export async function signInThroughUi(page: Page, credentials: Credentials, verificationCode: string | null): Promise<void> {
  try {
    await page.goto('/login');
    await page.locator('input[name="identifier"]').fill(credentials.email);
    const password = page.locator('input[name="password"]');
    // Clerk puede pedir la contraseña en el mismo paso o en uno posterior.
    if (!(await password.isVisible())) {
      await clickContinue(page);
    }
    await password.fill(credentials.password);
    await clickContinue(page);

    const shell = page.locator(SHELL);
    const code = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
    const clerkError = page.locator('.cl-formFieldErrorText').first();
    const selection = page.getByRole('heading', { name: 'Selecciona un taller' });
    const noAccess = page.getByRole('heading', { name: 'Sin acceso a talleres' });
    await shell.or(code).or(clerkError).or(selection).or(noAccess).first().waitFor({ timeout: 60_000 });

    if (await clerkError.isVisible()) {
      throw new Error('Clerk rechazó el inicio de sesión del usuario de prueba (revisa las credenciales del fixture).');
    }
    if (await selection.isVisible()) {
      throw new Error('El usuario de prueba tiene varias memberships activas: el fixture debe tener exactamente una.');
    }
    if (await noAccess.isVisible()) {
      throw new Error('El usuario de prueba no tiene membership activa en ningún taller.');
    }
    if (await code.isVisible()) {
      if (verificationCode === null) {
        throw new Error('Clerk pidió un código de verificación y E2E_VERIFICATION_CODE no está definido.');
      }
      await code.focus();
      await page.keyboard.type(verificationCode);
    }
    await expectWorkshopShell(page);
  } catch (error) {
    // El snapshot/captura de fallo de Playwright incluiría el correo y los puntos de la contraseña: se abandona el formulario.
    await page.goto('about:blank');
    throw error;
  }
}
