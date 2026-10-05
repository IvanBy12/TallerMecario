import { expect, type Page } from '@playwright/test';

import type { Credentials } from './env';
import { enterSecret, SecretEntryError } from './secret-input';

/**
 * Login REAL a través del componente <SignIn/> embebido de Clerk en /login (src/features/auth/clerk-session.tsx).
 * No se usa @clerk/testing ni ticket de backend: no requieren dependencias nuevas ni la secret key de Clerk en el runner.
 *
 * Los selectores de Clerk (`input[name=identifier]`, `input[name=password]`, botón «Continue») son los del SDK en inglés
 * por defecto y NO se han ejecutado contra una instancia real en este repositorio (ver docs/quality/s3-mobile-e2e.md).
 *
 * Higiene de credenciales (ver secret-input.ts): ni el correo, ni la contraseña, ni el código de verificación pasan por
 * `fill()`/`type()` (que los escribirían en el título del paso y en el call log). Además, CUALQUIER excepción del login se
 * reemplaza por un error nuevo con mensaje fijo: el error original (call log, texto de página, valores) no se relanza ni se
 * enlaza como `cause`.
 */

const SHELL = 'main#contenido-principal';

/** Pasos del login; solo sus nombres (fijos) pueden aparecer en un mensaje de error. */
export type LoginStep = 'abrir /login' | 'identificador' | 'continuar' | 'contraseña' | 'resultado' | 'código de verificación' | 'shell del taller';

/** Rechazos funcionales conocidos, con mensaje fijo y sin datos. */
class LoginRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginRejected';
  }
}

/** Único tipo de error que sale de signInThroughUi. */
export class LoginFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginFailure';
  }
}

async function clickContinue(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^continue$/i }).click();
}

export async function expectWorkshopShell(page: Page): Promise<void> {
  await expect(page.locator(SHELL)).toBeVisible({ timeout: 60_000 });
}

/** Nombres de clase de error admitidos en el mensaje (lista cerrada: un nombre arbitrario podría llevar datos). */
const SAFE_ERROR_NAMES: ReadonlySet<string> = new Set(['Error', 'TimeoutError', 'TypeError', 'RangeError']);

/** Mensaje seguro: solo texto fijo, el paso y, como mucho, el NOMBRE (de una lista cerrada) del error original. */
export function sanitizedLoginMessage(error: unknown, step: LoginStep): string {
  if (error instanceof LoginRejected) return error.message;
  if (error instanceof SecretEntryError) return `Login de prueba abortado en el paso «${step}»: ${error.message}`;
  const kind = error instanceof Error && SAFE_ERROR_NAMES.has(error.name) ? error.name : 'error desconocido';
  return `Login de prueba abortado en el paso «${step}» (${kind}). Detalle omitido a propósito para no filtrar credenciales.`;
}

export interface LoginOptions {
  /** Espera por campo antes de abandonar (por defecto 20 s). */
  readonly fieldTimeoutMs?: number;
  /** Espera por el resultado del envío (shell, código, error de Clerk…; por defecto 60 s). */
  readonly resultTimeoutMs?: number;
}

export async function signInThroughUi(
  page: Page,
  credentials: Credentials,
  verificationCode: string | null,
  options: LoginOptions = {},
): Promise<void> {
  const fieldTimeout = options.fieldTimeoutMs ?? 20_000;
  const resultTimeout = options.resultTimeoutMs ?? 60_000;
  let step: LoginStep = 'abrir /login';
  try {
    await page.goto('/login');
    step = 'identificador';
    await enterSecret(page.locator('input[name="identifier"]'), credentials.email, fieldTimeout);
    const password = page.locator('input[name="password"]');
    // Clerk puede pedir la contraseña en el mismo paso o en uno posterior.
    step = 'continuar';
    if (!(await password.isVisible())) {
      await clickContinue(page);
    }
    step = 'contraseña';
    await enterSecret(password, credentials.password, fieldTimeout);
    step = 'continuar';
    await clickContinue(page);

    step = 'resultado';
    const shell = page.locator(SHELL);
    const code = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
    const clerkError = page.locator('.cl-formFieldErrorText').first();
    const selection = page.getByRole('heading', { name: 'Selecciona un taller' });
    const noAccess = page.getByRole('heading', { name: 'Sin acceso a talleres' });
    await shell.or(code).or(clerkError).or(selection).or(noAccess).first().waitFor({ timeout: resultTimeout });

    if (await clerkError.isVisible()) {
      throw new LoginRejected('Clerk rechazó el inicio de sesión del usuario de prueba (revisa las credenciales del fixture).');
    }
    if (await selection.isVisible()) {
      throw new LoginRejected('El usuario de prueba tiene varias memberships activas: el fixture debe tener exactamente una.');
    }
    if (await noAccess.isVisible()) {
      throw new LoginRejected('El usuario de prueba no tiene membership activa en ningún taller.');
    }
    if (await code.isVisible()) {
      step = 'código de verificación';
      if (verificationCode === null) {
        const manualVerification =
          process.env['CI'] === undefined &&
          process.env['E2E_MANUAL_VERIFICATION'] === '1';

        if (!manualVerification) {
          throw new LoginRejected(
            'Clerk pidió un código de verificación y E2E_VERIFICATION_CODE no está definido.',
          );
        }

        console.log(
          'E2E: introduce manualmente el código de verificación en Chromium y continúa.',
        );

        step = 'resultado';
        await shell.or(clerkError).or(selection).or(noAccess).first().waitFor({
          timeout: 180_000,
        });

        if (await clerkError.isVisible()) {
          throw new LoginRejected(
            'Clerk rechazó el código de verificación del usuario de prueba.',
          );
        }
        if (await selection.isVisible()) {
          throw new LoginRejected(
            'El usuario de prueba tiene varias memberships activas: el fixture debe tener exactamente una.',
          );
        }
        if (await noAccess.isVisible()) {
          throw new LoginRejected(
            'El usuario de prueba no tiene membership activa en ningún taller.',
          );
        }
      } else {
        await enterSecret(code, verificationCode, fieldTimeout);
      }
    }
    step = 'shell del taller';
    await expectWorkshopShell(page);
  } catch (error) {
    // La página se abandona antes de que Playwright capture nada del formulario (error-context, capturas).
    await page.goto('about:blank').catch(() => undefined);
    // Error NUEVO, mensaje fijo, sin `cause`: nunca se relanza el original (su call log/mensaje podría contener datos).
    throw new LoginFailure(sanitizedLoginMessage(error, step));
  }
}
