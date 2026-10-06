/**
 * Política de artefactos de Playwright para CUALQUIER corrida que use credenciales (gate real). Se comparte entre
 * `playwright.config.ts` y la configuración sintética del harness para que lo que se demuestra sin credenciales sea
 * exactamente lo que corre con ellas.
 *
 * - trace: registra cabeceras Authorization, cookies, cuerpos y URL firmadas de R2.
 * - screenshot / video: capturan el formulario de login (correo, puntos de la contraseña) y datos de personas.
 * Solo se reactivarían con una implementación explícitamente sanitizada y demostrada por tests sintéticos.
 */
export const ARTIFACT_POLICY = {
  trace: 'off',
  screenshot: 'off',
  video: 'off',
} as const;
