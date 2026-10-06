import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LoginFailure, sanitizedLoginMessage } from '../../e2e/support/clerk-login';
import { SecretEntryError } from '../../e2e/support/secret-input';
import { ALL_MARKERS, SYNTHETIC_MARKERS } from '../helpers/markers';
import { REPO_ROOT } from '../helpers/run-playwright';
import { containsMarker, markerVariants, scanForMarkers, unzipEntries } from '../helpers/scan';
import { readRepoFile } from '../helpers/repo';
import { zipSync } from '../helpers/zip';

describe('estrategia anti-secreto (estática)', () => {
  const login = readRepoFile('e2e/support/clerk-login.ts');
  const secretInput = readRepoFile('e2e/support/secret-input.ts');

  it('el login no usa fill()/type()/press()/keyboard.type con valores sensibles', () => {
    const code = login.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.(fill|type|pressSequentially|press|insertText)\(/);
    expect(code).not.toMatch(/keyboard\./);
    expect(code).not.toMatch(/throw error\b/);
    expect(code).not.toMatch(/\bcause\s*:/);
  });

  it('las credenciales solo se usan como argumento de enterSecret', () => {
    const lines = login.split('\n').filter((line) => /credentials\.(password|email)|verificationCode/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line));
    const offenders = lines.filter((line) => !/enterSecret\(|verificationCode === null|verificationCode: string \| null|credentials: Credentials/.test(line));
    expect(offenders).toEqual([]);
  });

  it('enterSecret evalúa en el navegador, asigna con el setter nativo y emite input+change', () => {
    expect(secretInput).toContain('field.evaluate(');
    expect(secretInput).toContain("Reflect.set(HTMLInputElement.prototype, 'value', value, element)");
    expect(secretInput).toContain("new InputEvent('input'");
    expect(secretInput).toContain("new Event('change'");
    // La función del navegador captura sus excepciones y solo devuelve un código fijo.
    expect(secretInput).toMatch(/catch \{\s*return 'entry-threw';/);
  });

  it('ningún spec ni helper del gate real escribe el valor de una credencial con fill()', () => {
    for (const file of ['e2e/auth.setup.ts', 'e2e/support/clerk-login.ts', 'e2e/support/secret-input.ts']) {
      const code = readRepoFile(file);
      expect(code, file).not.toMatch(/\.fill\([^)]*(password|credentials|verificationCode)/i);
    }
  });
});

describe('errores sanitizados', () => {
  const hostileMessages = ALL_MARKERS.flatMap((marker) => [
    new Error(`locator.fill: Timeout\nCall log:\n  - fill("${marker}")`),
    Object.assign(new Error('boom'), { name: marker }),
    Object.assign(new Error('boom'), { cause: new Error(marker), stack: `Error: ${marker}\n at x` }),
  ]);

  it.each(hostileMessages.map((error, index) => [index, error] as const))('el error hostil #%i no se refleja en el mensaje saneado', (_index, error) => {
    for (const step of ['contraseña', 'identificador', 'código de verificación'] as const) {
      const message = sanitizedLoginMessage(error, step);
      for (const marker of ALL_MARKERS) expect(message.includes(marker)).toBe(false);
      expect(message).toContain(step);
    }
  });

  it('un nombre de error arbitrario nunca se copia al mensaje (lista cerrada)', () => {
    const error = Object.assign(new Error('x'), { name: SYNTHETIC_MARKERS.password });
    expect(sanitizedLoginMessage(error, 'contraseña')).toContain('error desconocido');
  });

  it('LoginFailure y SecretEntryError llevan texto fijo y no tienen cause', () => {
    const failure = new LoginFailure(sanitizedLoginMessage(new Error(SYNTHETIC_MARKERS.password), 'contraseña'));
    expect(failure.cause).toBeUndefined();
    const entry = new SecretEntryError('entry-threw');
    expect(entry.cause).toBeUndefined();
    expect(JSON.stringify({ own: Object.keys(failure), message: failure.message, entry: entry.message })).not.toContain('AUDIT_SYNTHETIC');
  });
});

describe('escáner de canales persistibles (sensibilidad)', () => {
  it('detecta el marcador en crudo, URL-codificado, hex, UTF-16 y base64 en los tres alineamientos', () => {
    const marker = SYNTHETIC_MARKERS.password;
    for (const prefix of ['', 'x', 'xy', 'xyz']) {
      expect(containsMarker(Buffer.from(`${prefix}${marker}`).toString('base64'), marker), `base64 con prefijo "${prefix}"`).toBe(true);
    }
    expect(containsMarker(Buffer.from(marker, 'utf16le'), marker)).toBe(true);
    expect(containsMarker(Buffer.from(marker).toString('hex'), marker)).toBe(true);
    expect(containsMarker(`a=${encodeURIComponent(marker)}`, marker)).toBe(true);
    expect(containsMarker('nada que ver', marker)).toBe(false);
    expect(markerVariants(marker).length).toBeGreaterThanOrEqual(5);
  });

  it('mira dentro de zips (el HTML report los embebe en base64) y de nombres de archivo', () => {
    const dir = fs.mkdtempSync(path.join(path.join(REPO_ROOT, 'node_modules', '.tmp'), 'scan-'));
    try {
      const zip = zipSync([{ name: 'report.json', data: Buffer.from(`{"title":"Fill \\"${SYNTHETIC_MARKERS.cookie}\\""}`) }]);
      expect(unzipEntries(zip).map((entry) => entry.name)).toEqual(['report.json']);
      fs.writeFileSync(path.join(dir, 'index.html'), `<script>data:application/zip;base64,${zip.toString('base64')}</script>`);
      fs.writeFileSync(path.join(dir, 'limpio.txt'), 'sin secretos');
      const hits = scanForMarkers(dir, ALL_MARKERS);
      expect(hits.map((hit) => [hit.marker, hit.where])).toEqual([[SYNTHETIC_MARKERS.cookie, 'index.html [embedded-zip:report.json]']]);
      fs.writeFileSync(path.join(dir, `${SYNTHETIC_MARKERS.token}.log`), '');
      expect(scanForMarkers(dir, ALL_MARKERS).some((hit) => hit.where.startsWith('nombre de archivo'))).toBe(true);
      expect(scanForMarkers(dir, ALL_MARKERS, { stdout: `x ${SYNTHETIC_MARKERS.signedQuery}` }).some((hit) => hit.where === 'stdout')).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
