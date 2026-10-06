import type { Page } from '@playwright/test';

import { MOBILE_VIEWPORT_WIDTH_RANGE } from './devices';

/**
 * Comprobación en RUNTIME de que el navegador del gate es realmente móvil/táctil. La configuración (`hasTouch`, `isMobile`,
 * viewport) no basta por sí sola: aquí se mide lo que el navegador reporta. No hay fallback a ratón como evidencia.
 */

export interface MobileRuntimeMetrics {
  readonly maxTouchPoints: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
}

export function mobileRuntimeProblems(metrics: MobileRuntimeMetrics): readonly string[] {
  const problems: string[] = [];
  if (!(metrics.maxTouchPoints > 0)) {
    problems.push(`navigator.maxTouchPoints = ${String(metrics.maxTouchPoints)} (se exige > 0: entrada táctil)`);
  }
  const { min, max } = MOBILE_VIEWPORT_WIDTH_RANGE;
  if (metrics.innerWidth < min || metrics.innerWidth > max) {
    problems.push(`ancho de viewport ${String(metrics.innerWidth)} px fuera del rango móvil ${String(min)}–${String(max)}`);
  }
  return problems;
}

export async function readMobileRuntime(page: Page): Promise<MobileRuntimeMetrics> {
  return page.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
}

/** Falla si el contexto no es táctil o su viewport no es móvil. Llamar con la app ya cargada (respeta su meta viewport). */
export async function assertMobileRuntime(page: Page): Promise<MobileRuntimeMetrics> {
  const metrics = await readMobileRuntime(page);
  const problems = mobileRuntimeProblems(metrics);
  if (problems.length > 0) {
    throw new Error(`El navegador del gate no es móvil/táctil: ${problems.join('; ')}.`);
  }
  return metrics;
}
