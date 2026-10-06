import { describe, expect, it } from 'vitest';

import { assertInk, INK_THRESHOLDS, inkVerdict, type InkMetrics } from '../../e2e/support/signature-ink';

const CANVAS = { canvasWidth: 1440, canvasHeight: 720 } as const;
const metrics = (overrides: Partial<InkMetrics>): InkMetrics => ({ inkPixels: 0, inkWidth: 0, inkHeight: 0, ...CANVAS, ...overrides });

describe('F4 · veredicto de tinta (lógica pura; los píxeles se miden en Chromium en synthetic-browser)', () => {
  it('canvas vacío → FAIL', () => {
    const verdict = inkVerdict(metrics({}));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.length).toBe(3);
    expect(() => assertInk(metrics({}))).toThrow(/no contiene tinta real/);
  });

  it('punto / click insuficiente → FAIL', () => {
    expect(inkVerdict(metrics({ inkPixels: 90, inkWidth: 11, inkHeight: 11 })).ok).toBe(false);
  });

  it('muchos píxeles pero en una caja minúscula → FAIL (no basta el conteo)', () => {
    expect(inkVerdict(metrics({ inkPixels: 5_000, inkWidth: 40, inkHeight: 40 })).ok).toBe(false);
  });

  it('línea fina horizontal sin altura → FAIL', () => {
    expect(inkVerdict(metrics({ inkPixels: 12_000, inkWidth: 1_000, inkHeight: 10 })).ok).toBe(false);
  });

  it('trazo real extendido → PASS', () => {
    expect(inkVerdict(metrics({ inkPixels: 14_000, inkWidth: 1_094, inkHeight: 400 })).ok).toBe(true);
    expect(assertInk(metrics({ inkPixels: 14_000, inkWidth: 1_094, inkHeight: 400 })).inkPixels).toBe(14_000);
  });

  it('justo en los umbrales pasa; un píxel por debajo falla', () => {
    const edge = { inkPixels: INK_THRESHOLDS.minPixels, inkWidth: 1440 * INK_THRESHOLDS.minWidthRatio, inkHeight: 720 * INK_THRESHOLDS.minHeightRatio };
    expect(inkVerdict(metrics(edge)).ok).toBe(true);
    expect(inkVerdict(metrics({ ...edge, inkPixels: edge.inkPixels - 1 })).ok).toBe(false);
    expect(inkVerdict(metrics({ ...edge, inkWidth: edge.inkWidth - 1 })).ok).toBe(false);
    expect(inkVerdict(metrics({ ...edge, inkHeight: edge.inkHeight - 1 })).ok).toBe(false);
  });

  it('canvas sin tamaño → FAIL', () => {
    expect(inkVerdict({ inkPixels: 0, inkWidth: 0, inkHeight: 0, canvasWidth: 0, canvasHeight: 0 }).ok).toBe(false);
  });

  it('el mensaje de error solo lleva conteos (ningún dato de la imagen)', () => {
    let message = '';
    try {
      assertInk(metrics({ inkPixels: 3 }));
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toMatch(/^El canvas de firma no contiene tinta real: [\d\sa-záéíóúñ:.,;()\-/]+\.$/i);
    expect(message).not.toMatch(/data:|base64|blob/i);
  });
});
