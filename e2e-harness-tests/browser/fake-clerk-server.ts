import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { MARKER_ENV, SYNTHETIC_EMAIL } from '../helpers/markers';

/**
 * Servidor LOCAL que imita lo mínimo de <SignIn/> de Clerk que usa e2e/support/clerk-login.ts: `input[name=identifier]`,
 * `input[name=password]`, botón «Continue», `.cl-formFieldErrorText` y `main#contenido-principal` al terminar.
 *
 * El estado del formulario se alimenta SOLO con eventos `input` (como un componente controlado de React): asignar `.value` sin
 * disparar eventos no lo actualiza. El servidor compara lo enviado con AUDIT_SYNTHETIC_PASSWORD y registra únicamente booleanos.
 */

export type ClerkMode =
  /** Identificador y contraseña en el mismo paso. */
  | 'single-step'
  /** Contraseña en un segundo paso, tras «Continue». */
  | 'two-step'
  /** El servidor rechaza la contraseña y se muestra el error de Clerk. */
  | 'wrong-password'
  /** La página hostil lanza una excepción con el VALOR dentro cuando se le asigna el valor a un input. */
  | 'hostile-setter'
  /** No existe el campo de contraseña. */
  | 'no-password-field';

export interface CheckRecord {
  readonly identifierMatched: boolean;
  readonly passwordMatched: boolean;
}

export interface FakeClerk {
  readonly baseURL: string;
  readonly checks: readonly CheckRecord[];
  close(): Promise<void>;
}

function loginPage(mode: ClerkMode): string {
  const passwordField =
    mode === 'no-password-field'
      ? ''
      : `<label>Password <input name="password" type="password" ${mode === 'two-step' ? 'style="display:none"' : ''}></label>`;
  const hostile =
    mode === 'hostile-setter'
      ? `const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
Object.defineProperty(HTMLInputElement.prototype, 'value', {
  configurable: true,
  get() { return native.get.call(this); },
  set(v) { if (this.name === 'password') throw new Error('rechazado: ' + v); native.set.call(this, v); },
});`
      : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>fake clerk</title></head>
<body><div id="root"><form id="sign-in" novalidate>
<label>Email <input name="identifier" type="text"></label>
${passwordField}
<p class="cl-formFieldErrorText" style="display:none">Credenciales incorrectas</p>
<button type="submit">Continue</button></form></div>
<script>
${hostile}
const state = { identifier: '', password: '' };
window.__fakeClerk = { events: [] };
for (const input of document.querySelectorAll('input')) {
  for (const type of ['input', 'change']) {
    input.addEventListener(type, (event) => {
      window.__fakeClerk.events.push(input.name + ':' + type + ':' + event.bubbles);
      if (type === 'input') state[input.name] = input.value;
    });
  }
}
const form = document.getElementById('sign-in');
const password = form.querySelector('input[name=password]');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (${mode === 'two-step' ? 'true' : 'false'} && password && password.style.display === 'none') { password.style.display = ''; return; }
  const response = await fetch('/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
  const result = await response.json();
  if (result.ok) {
    document.getElementById('root').innerHTML = '<main id="contenido-principal">Taller sintético</main>';
  } else {
    form.querySelector('.cl-formFieldErrorText').style.display = '';
  }
});
</script></body></html>`;
}

const CANVAS_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>canvas</title>
<style>body{margin:0}canvas{width:100%;display:block;touch-action:none;border:1px solid #888}</style></head><body>
<canvas width="1440" height="720" aria-label="Firma manuscrita de recepción"></canvas>
<script>
// Réplica del trazado de src/features/reception/reception-signature-pad.tsx (fondo transparente, trazo redondeado).
const canvas = document.querySelector('canvas');
let pointer = null;
canvas.addEventListener('pointerdown', (event) => {
  if (pointer !== null) return;
  const context = canvas.getContext('2d'), box = canvas.getBoundingClientRect();
  event.preventDefault(); pointer = event.pointerId; canvas.setPointerCapture(event.pointerId);
  const x = (event.clientX - box.left) * canvas.width / box.width, y = (event.clientY - box.top) * canvas.height / box.height;
  context.lineWidth = 2.5 * canvas.width / box.width; context.lineCap = 'round'; context.lineJoin = 'round';
  context.strokeStyle = '#172b4d'; context.beginPath(); context.moveTo(x, y); context.lineTo(x + 0.1, y + 0.1); context.stroke();
});
canvas.addEventListener('pointermove', (event) => {
  if (pointer !== event.pointerId) return;
  const context = canvas.getContext('2d'), box = canvas.getBoundingClientRect();
  context.lineTo((event.clientX - box.left) * canvas.width / box.width, (event.clientY - box.top) * canvas.height / box.height); context.stroke();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { pointer = null; });
</script></body></html>`;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function startFakeClerk(mode: ClerkMode, expectedPassword: string): Promise<FakeClerk> {
  const checks: CheckRecord[] = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/login') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(loginPage(mode));
    } else if (request.method === 'GET' && url.pathname === '/canvas') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(CANVAS_PAGE);
    } else if (request.method === 'POST' && url.pathname === '/api/v1/media/upload-sessions') {
      // Respuesta contractual de create-upload con URL firmada (query sintética) y una cookie sintética.
      const signedQuery = process.env[MARKER_ENV.signedQuery] ?? 'missing';
      const cookie = process.env[MARKER_ENV.cookie] ?? 'missing';
      response
        .writeHead(201, { 'content-type': 'application/json', 'set-cookie': `session=${cookie}; Path=/` })
        .end(
          JSON.stringify({
            uploadSessionId: '11111111-1111-4111-8111-111111111111',
            mediaAssetId: '22222222-2222-4222-8222-222222222222',
            status: 'pending',
            uploadUrl: `https://objects.example.invalid/bucket/tenant/22222222-2222-4222-8222-222222222222.png?X-Amz-Signature=${signedQuery}`,
            uploadMethod: 'PUT',
            uploadHeaders: { 'content-type': 'image/png' },
            objectKey: 'tenant/22222222-2222-4222-8222-222222222222.png',
            expiresAt: '2030-01-01T00:00:00.000Z',
          }),
        );
    } else if (request.method === 'POST' && url.pathname === '/check') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = parseJson(Buffer.concat(chunks).toString('utf8'));
        const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
        const identifierMatched = record['identifier'] === SYNTHETIC_EMAIL;
        const passwordMatched = mode !== 'wrong-password' && record['password'] === expectedPassword;
        checks.push({ identifierMatched, passwordMatched });
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: identifierMatched && passwordMatched }));
      });
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${String(port)}`,
    checks,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
