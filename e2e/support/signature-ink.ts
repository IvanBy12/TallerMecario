import type { Locator, Page } from '@playwright/test';

/**
 * Demuestra TINTA REAL en el canvas de firma inspeccionando sus píxeles dentro del navegador. Habilitar «Registrar firma»,
 * `hasInk` o `blob.size > 0` no basta: un PNG vacío también pesa.
 *
 * Solo salen métricas no sensibles (conteos). Nunca se serializa el PNG, `toDataURL`, `toBlob` ni los píxeles, y no se adjunta
 * nada como artefacto. El análisis es de solo lectura (`getImageData`).
 */

export const SIGNATURE_CANVAS_LABEL = 'Firma manuscrita de recepción';

export interface InkMetrics {
  /** Píxeles que difieren del fondo (el fondo se estima por mayoría de las cuatro esquinas). */
  readonly inkPixels: number;
  /** Ancho de la caja que envuelve la tinta, en píxeles de canvas. */
  readonly inkWidth: number;
  /** Alto de la caja que envuelve la tinta, en píxeles de canvas. */
  readonly inkHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

/**
 * Umbrales sobre el canvas de la aplicación (1440×720, trazo ≈ 11 px). Un toque/clic deja un punto de ~100 px (< 400 px y con caja
 * de ~11 px) → insuficiente; el trazo extendido del gate deja >10 000 px con una caja de ~75 % × ~50 % del canvas.
 */
export const INK_THRESHOLDS = { minPixels: 400, minWidthRatio: 0.2, minHeightRatio: 0.05 } as const;

export interface InkVerdict {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

export function inkVerdict(metrics: InkMetrics): InkVerdict {
  const problems: string[] = [];
  if (metrics.canvasWidth <= 0 || metrics.canvasHeight <= 0) {
    problems.push('el canvas no tiene tamaño');
  } else {
    if (metrics.inkPixels < INK_THRESHOLDS.minPixels) {
      problems.push(`tinta insuficiente: ${String(metrics.inkPixels)} px (mínimo ${String(INK_THRESHOLDS.minPixels)})`);
    }
    if (metrics.inkWidth < metrics.canvasWidth * INK_THRESHOLDS.minWidthRatio) {
      problems.push(`caja de tinta demasiado estrecha: ${String(metrics.inkWidth)} px de ${String(metrics.canvasWidth)}`);
    }
    if (metrics.inkHeight < metrics.canvasHeight * INK_THRESHOLDS.minHeightRatio) {
      problems.push(`caja de tinta demasiado baja: ${String(metrics.inkHeight)} px de ${String(metrics.canvasHeight)}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Se ejecuta DENTRO del navegador (Playwright la serializa con toString): debe ser autocontenida. */
function measureCanvasInkInBrowser(element: Element): InkMetrics | null {
  if (!(element instanceof HTMLCanvasElement)) return null;
  const context = element.getContext('2d');
  const { width, height } = element;
  if (context === null) return null;
  if (width === 0 || height === 0) return { inkPixels: 0, inkWidth: 0, inkHeight: 0, canvasWidth: width, canvasHeight: height };
  const { data } = context.getImageData(0, 0, width, height);
  const at = (x: number, y: number): [number, number, number, number] => {
    const index = (y * width + x) * 4;
    return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0, data[index + 3] ?? 0];
  };
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  let background = corners[0] ?? [0, 0, 0, 0];
  let best = 0;
  for (const candidate of corners) {
    const votes = corners.filter((corner) => same(corner, candidate)).length;
    if (votes > best) {
      best = votes;
      background = candidate;
    }
  }
  const [br, bg, bb, ba] = background;
  let inkPixels = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const diff = Math.max(
        Math.abs((data[index] ?? 0) - br),
        Math.abs((data[index + 1] ?? 0) - bg),
        Math.abs((data[index + 2] ?? 0) - bb),
        Math.abs((data[index + 3] ?? 0) - ba),
      );
      if (diff >= 48) {
        inkPixels += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    inkPixels,
    inkWidth: maxX < 0 ? 0 : maxX - minX + 1,
    inkHeight: maxY < 0 ? 0 : maxY - minY + 1,
    canvasWidth: width,
    canvasHeight: height,
  };
}

export async function measureCanvasInk(canvas: Locator): Promise<InkMetrics> {
  const metrics = await canvas.evaluate(measureCanvasInkInBrowser);
  if (metrics === null) {
    throw new Error('No se pudo leer el canvas de firma (no es un <canvas> 2D legible).');
  }
  return metrics;
}

export async function measureSignatureInk(page: Page): Promise<InkMetrics> {
  return measureCanvasInk(page.getByLabel(SIGNATURE_CANVAS_LABEL));
}

/** Lanza si el canvas no contiene tinta real. El mensaje solo lleva conteos. */
export function assertInk(metrics: InkMetrics): InkMetrics {
  const verdict = inkVerdict(metrics);
  if (!verdict.ok) {
    throw new Error(`El canvas de firma no contiene tinta real: ${verdict.problems.join('; ')}.`);
  }
  return metrics;
}

export async function expectSignatureInk(page: Page): Promise<InkMetrics> {
  return assertInk(await measureSignatureInk(page));
}
