# Sprint 3 — Gate E2E móvil (recepción)

## Estado del gate

**Decisión: `READY_FOR_GATE`** — el harness está implementado y verificado estáticamente, pero **NO se ha ejecutado contra
infraestructura real** (backend, Clerk de prueba, PostgreSQL de prueba, R2). Ningún caso está en `PASS`. Que el código E2E exista
no aprueba el gate: el gate se aprueba solo con una corrida real `mobile-chromium` en verde y esta tabla actualizada con su evidencia.

| Campo | Valor |
| --- | --- |
| Estado del harness | **harness hardened** — endurecido tras la revisión adversarial (F1–F7) y probado sin credenciales con `npm run test:e2e:harness` |
| Estado del ambiente real | **real environment pending** — ninguna corrida contra Clerk/backend/R2 reales; ningún caso en `PASS` |
| Fecha de redacción | 2026-10-04 |
| Rama / base | `task/s3-e2e-mobile` sobre `origin/main` `2340f235c0d0d50150216c3b60c9352a6af00ef2` |
| Commit frontend | el commit de esta rama que contiene este archivo (`git log -1 -- docs/quality/s3-mobile-e2e.md`) |
| Commit backend esperado | `4c456d92c09aa26433a05aed56669dcbffe58e6d` (TallerMecarioB `main`, merge del PR #7 `task/s3-final-gaps`: inspección, firma, R2 en producción y cierre). Confirmar con `git rev-parse HEAD` del backend desplegado en la corrida |
| Ambiente de la corrida | _pendiente_ (backend de prueba + Clerk `pk_test_…` + PostgreSQL de prueba + bucket R2 de prueba) |
| Browser / dispositivo | Chromium 153 (Playwright 1.63), descriptor **Pixel 5**: viewport 393×727, `isMobile`, `hasTouch`, user agent Android/Chrome móvil, DPR 2.75 |
| Proyecto del gate | `mobile-chromium` (`npm run e2e:mobile`). `desktop-smoke` es complementario y no sustituye al gate |

## Casos

Estados posibles: `PASS`, `FAIL`, `NOT_RUN`. Todos están hoy en `NOT_RUN` (sin infraestructura real). Cada fila indica qué parte es
UI real y cuál es verificación server-side.

| Caso | Spec | Qué recorre | UI real | Servidor real | Estado |
| --- | --- | --- | --- | --- | --- |
| Setup | `e2e/auth.setup.ts` | Preflight de variables; login Clerk por UI de asesor A, técnico A y usuario B; valida `GET /me` y `GET /me/context` (permisos y una sola membership por persona) | Login en `<SignIn/>` | `/api/v1/me`, `/api/v1/me/context` | NOT_RUN |
| E2E-01 | `e2e/s3-happy-path.spec.ts` | Login → taller activo → Recepciones → Nueva recepción → buscar placa → (crear cliente → crear vehículo → volver) → seleccionar → propietario → consentimiento `service_provision` + atestación de mayoría de edad → km / combustible / observaciones → crear → checklist (agregar y editar) y daño → recarga y persistencia → documento de aceptación real → nombre → lectura → firma dibujada con eventos táctiles reales (solo `touch`; sin rama de ratón) → **píxeles del canvas inspeccionados: tinta real** → registrar → cerrar (diálogo) → «Orden #N» + «Generada correctamente» | Todo el flujo, incluido el trazo de la firma (CDP `Input.dispatchTouchEvent` → pointer events táctiles) y la comprobación en runtime `navigator.maxTouchPoints > 0` + viewport móvil | Todos los endpoints de recepción, consentimiento, CRM, media y cierre | NOT_RUN |
| E2E-02 | ídem | Recarga: sigue `Cerrada`, mismo `Orden #N`, sin botón «Cerrar recepción». `POST /receptions/:id/close` reintentado con la sesión del asesor → 200 con el mismo `serviceOrder.id`/`orderNumber`; detalle idéntico antes y después | Estado tras recarga | Reintento real de close (endpoint existente §5.8; el backend lo prueba como «retry is read-only») | NOT_RUN |
| E2E-03 | ídem | Estado inicial de la orden visible (`Estado: Recepción`) | Estado de la orden | `serviceOrder.status = reception` en el detalle. **El historial (`order_status_history`) NO es observable por HTTP/UI en Sprint 3** | NOT_RUN (parcial, ver «Historial») |
| E2E-04 | `e2e/s3-rbac.spec.ts` | El asesor abre una recepción; una sesión real de técnico (sin `receptions.update_open`/`signatures.capture`/`receptions.close` tenant) intenta por UI y por HTTP: PATCH recepción/checklist/daños, GET documento de aceptación, POST firma, POST close, POST crear → todos deben dar **403 `PERMISSION_DENIED`**; después el asesor comprueba que la recepción es idéntica y sigue abierta, sin firma ni orden | Ausencia de acciones; mensajes de permiso | Estado y código de las 7 operaciones + inmutabilidad | NOT_RUN |
| E2E-05 | `e2e/s3-cross-tenant.spec.ts` | Control: la sesión de B lee su recepción real (200). El asesor de A abre `/recepciones/<id de B>`: 404 `RECEPTION_NOT_FOUND`, sin datos ni campos de B. Peticiones reales con la sesión de A: GET con `X-Tenant-Id` A → 404; GET con `X-Tenant-Id` B → 403 de tenant; PATCH no destructivo (token de versión obsoleto) → 404; el listado de A, **agotado hasta `nextCursor === null`**, no contiene el ID de B (cursor pendiente tras el tope, cursor repetido o ciclo = FAIL); el recurso de B queda intacto; centinela opcional ausente | Mensaje de recurso no encontrado, ausencia de datos | Estado/código/envelope de cada petición | NOT_RUN |
| E2E-06 | `e2e/s3-happy-path.spec.ts` | Evidencia de red sanitizada y **correlacionada** del E2E-01: `POST /media/upload-sessions` (uploadSessionId, mediaAssetId, uploadUrl) → `PUT` al **mismo origen y ruta** de esa uploadUrl con 2xx → `POST …/{uploadSessionId}/complete` (misma media `active`) → `POST /receptions/{id}/signature` con ese mediaAssetId y envelope `{ signature: {…} }`, en ese orden; la firma persiste y se ve tras el cierre | Firma registrada | Los cuatro eventos con estado HTTP | NOT_RUN |
| Smoke escritorio | `e2e/desktop-smoke.spec.ts` | Sesión, Recepciones, pantalla de nueva recepción (solo lectura) | Sí | Lectura | NOT_RUN |

Cobertura de los ítems de «Sprint 3 — Recepción» de `docs/quality/frontend-relevant-gates.md`: *Buscar placa*, *Crear cliente/vehículo si
no existe*, *Kilometraje*, *Combustible*, *Checklist*, *Daños*, *Observaciones*, *Firma*, *Cerrar recepción*, *Crear orden una sola vez*,
*Tenant isolation*, *Idempotencia de cierre*, *E2E desde móvil*. **El ítem *Historial* queda cubierto server-side** (ver abajo). Los ítems
de base de datos de esa lista (CHECK XOR, FKs, locks, migraciones) son del backend y no se ejercitan aquí.

### Historial (E2E-03)

Sprint 3 no expone endpoint ni UI de historial de órdenes (el contrato `docs/api/reception-contract.md` no define `GET /orders` ni
`orders.read`; la lectura de órdenes llega con Sprint 5). Por eso **no se inventa ninguna feature**: el frontend solo observa el estado
inicial `reception` de la orden. La fila inicial `NULL → reception` de `order_status_history` y su unicidad se verifican en el backend:

- `TallerMecarioB/tests/reception-api/close.test.cjs` — «close persists exactly one order, history, mileage and audit; retry is read-only»
  (una fila `NULL → reception` ligada al `request_id` de la auditoría; el segundo close no crea orden ni historial).
- `TallerMecarioB/scripts/staging-reception-e2e.cjs` — snapshot de filas de `order_status_history` antes/después en el ambiente desplegado.
- `TallerMecarioB/docs/SPRINT-3-BACKEND-FINAL-QUALITY-GATE.md` §9 «Exactly-once close evidence».

Igualmente, «exactamente una service order» se demuestra por HTTP con el mismo `serviceOrder.id` tras el reintento de close (E2E-02); el
conteo de filas en PostgreSQL es evidencia server-side (misma suite de backend).

## Qué es UI real y qué es server-side

- **UI real (Playwright, navegador móvil):** login Clerk, contexto de taller, navegación, CRM, ingreso, consentimiento, inspección, documento
  de aceptación, trazo de la firma, diálogo de cierre, resumen de la orden, ausencia de acciones para el técnico y de datos ajenos.
- **Servidor real (peticiones del mismo navegador con la sesión Clerk viva):** todo `/api/v1/*` que usa la aplicación; las sondas de
  E2E-02/04/05 usan `fetch` dentro de la página con `window.Clerk.session.getToken()`, de modo que el token nunca sale del navegador.
- **Solo server-side (no observable en Sprint 3):** filas de `order_status_history`, conteos de `service_orders`/`signatures` en PostgreSQL,
  auditoría, RLS. Se prueban en TallerMecarioB; este gate no afirma que hayan pasado.
- **No hay mocks:** sin `page.route()`, MSW, fetch simulado ni fixtures de respuesta; Clerk, API y R2 son reales. (Los 597 tests Vitest siguen
  usando transporte inyectado y no forman parte de este gate.)

## Cómo ejecutarlo

```bash
npm ci
npx playwright install chromium
cp .env.e2e.example .env.e2e        # completar valores en local; está en .gitignore
npm run test:e2e:harness            # pruebas del propio harness (sin credenciales; requiere Chromium)
npm run e2e:list                    # descubre los casos sin credenciales
npm run e2e:mobile                  # gate principal (proyecto mobile-chromium; headless)
npm run e2e:headed                  # igual, con navegador visible
npm run e2e                         # mobile-chromium + desktop-smoke
```

`npm test` (Vitest) no cambia y no ejecuta E2E. Sin `E2E_BASE_URL`, Playwright arranca `npm run dev` en `http://localhost:5173`.
Si falta cualquier variable, el `preflight` **falla** nombrando las variables ausentes y el resto no se ejecuta (nunca se marca verde).

## Variables

Públicas (las del frontend, `.env.example`): `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY` (debe ser `pk_test_…`; el harness se
niega con `pk_live_…`).

Privadas del runner (nunca en Git; `.env.e2e.example` solo lista nombres):

| Variable | Uso |
| --- | --- |
| `E2E_TENANT_ID` | UUID del taller A |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` | Asesor/owner del taller A con **una sola** membership y permisos `receptions.*`, `signatures.capture`, `media.upload`, `customers.*`, `vehicles.*`, `vehicle_owners.manage` (tenant) |
| `E2E_RESTRICTED_EMAIL`, `E2E_RESTRICTED_PASSWORD` | Técnico del taller A (sin `receptions.update_open`/`receptions.close`/`signatures.capture` tenant), una sola membership |
| `E2E_TENANT_B_ID` | UUID del taller B (distinto de A) |
| `E2E_TENANT_B_USER_EMAIL`, `E2E_TENANT_B_USER_PASSWORD` | Usuario con membership solo en B (control de existencia del recurso) |
| `E2E_TENANT_B_RECEPTION_ID` | UUID de una recepción **real** de B |
| `E2E_TENANT_B_SENTINEL` (opcional) | Texto distintivo de esa recepción para afirmar que no se filtra |
| `E2E_VERIFICATION_CODE` (opcional) | Código de Clerk si el ambiente lo exige (usuarios `+clerk_test`) |
| `E2E_BASE_URL` (opcional) | Frontend ya desplegado en lugar de `npm run dev` |

**Variable retirada:** la placa fija (variable de entorno `E2E_VEHICLE_PLATE`) obligaba a que todas las corridas mutantes reutilizaran un vehículo que, tras la primera recepción abierta, ya no admitía otra. El preflight **rechaza** la variable si está definida. No existe un uso de solo lectura que la justifique: el flujo siempre crea datos propios.

La autenticación usa la UI real de Clerk (`<SignIn/>` en `/login`), compatible con el proyecto: no añade `@clerk/testing` ni requiere la
secret key de Clerk en el runner.

## Datos de prueba, aislamiento y limpieza

- **Cada test que muta datos pide su propio `newRunId()`** (10 caracteres `[0-9A-Z]`: 6 de reloj en base 36 + 4 de CSPRNG, sin repetirse dentro del proceso) y lo usa en: placa `E2E<id>` (13 caracteres, cumple `^[A-Z0-9]{1,16}$` de `docs/api/crm.md`), nombre del cliente
  `E2E<id> Playwright`, observaciones, código/etiqueta de checklist, nombre del firmante. Son identificables y no colisionan entre corridas ni entre tests de la misma corrida: **dos ejecuciones consecutivas no requieren limpieza externa**.
- E2E-01 y E2E-04 crean su propio cliente, vehículo y recepción (una recepción abierta por vehículo: jamás se reutiliza un vehículo). E2E-05 solo lee/rechaza.
- **No hay API pública de borrado** (el contrato declara que no existen cancelar, reabrir ni borrar recepciones; tampoco hay delete de clientes
  o vehículos en este flujo), y no se inventan endpoints de limpieza. Estrategia: el ambiente de prueba debe ser desechable o recreable
  por el equipo de backend (su drill de staging genera y destruye la base); los datos `E2E<id>` se purgan al recrearla. Esta decisión de
  ambiente sigue pendiente de confirmar con backend. El E2E nunca borra
  datos ajenos, y la firma queda en R2 con la retención de evidencia del servicio.
- Las recepciones cerradas de E2E-01 acumulan órdenes numeradas por taller; los números de orden no son deterministas, por eso se leen de la UI.

## Seguridad de los artefactos y de las credenciales

**Estrategia anti-secreto (F1).** `fill()`, `type()` y `press()` de Playwright escriben su argumento en el título del paso y en el call log
de los errores, y de ahí pasa a `list`, `json`, `junit` y al reporte HTML. Se verificó empíricamente (control positivo
`e2e-harness-tests/browser/control`) que un `fill(password)` deja el valor en el reporte HTML —comprimido en base64 dentro de `index.html`, por
lo que un `includes()` sobre el archivo no lo vería—. Por eso:

- Correo, contraseña y código de verificación entran con `enterSecret` (`e2e/support/secret-input.ts`): una única acción visible
  (`locator.evaluate`) cuyo título no lleva el valor. Dentro del navegador se enfoca el campo, se asigna con el **setter nativo** de
  `HTMLInputElement.prototype` (el rastreador de React detecta el cambio como con el teclado) y se emiten `input` (InputEvent) y `change`
  con `bubbles`; se comprueba que el valor quedó aplicado y solo se devuelve un código fijo. Esa función captura sus propias excepciones.
- Cualquier excepción del login se sustituye por un `LoginFailure` **nuevo**, con mensaje fijo (paso + nombre de clase de una lista cerrada) y
  **sin `cause`**; el error original (call log, texto de página) nunca se relanza. La página se lleva a `about:blank` antes.
- `trace`, `screenshot` y `video` están en `off` para todas las corridas con credenciales (`e2e/support/artifact-policy.ts`, compartido por la
  configuración real y la del harness). En CI el reporter es solo `list`.
- **El reporte HTML y `test-results/` de una corrida autenticada no se publican** (el workflow no sube artefactos). Aunque el harness demuestra
  que las credenciales no entran, esos archivos contienen además correos, IDs de taller y texto de páginas con PII; es preferible perder el
  artefacto a exponerlo. `e2e/.auth/` (cookies de sesión de Clerk) tampoco se sube nunca.
- La evidencia técnica (E2E-06) viene de `e2e/support/network-evidence.ts`: orden, método, ruta con UUID enmascarados, estado HTTP y
  booleanos. De la `uploadUrl` firmada solo se retienen **en memoria** origen y ruta para correlacionar el PUT; nunca query, firma, credencial ni
  URL completa, y `toJSON()` del colector solo expone las entradas sanitizadas.
- Límite conocido: `DEBUG=pw:*` / `PWDEBUG` activan trazas internas de Playwright que no forman parte de la garantía; el workflow no los define
  (lo comprueba `e2e-harness-tests/unit/workflows.test.ts`) y no deben activarse en corridas con credenciales. En local se comprobó que
  `DEBUG=pw:api` no imprime el argumento de `locator.evaluate`.

**Prueba automática (sin credenciales reales).** `npm run test:e2e:harness` lanza Playwright en un proceso hijo con entorno limpio, contra un
formulario local que imita a Clerk, con los marcadores sintéticos `AUDIT_SYNTHETIC_PASSWORD`, `AUDIT_SYNTHETIC_TOKEN`,
`AUDIT_SYNTHETIC_COOKIE` y `AUDIT_SYNTHETIC_SIGNED_QUERY`, fuerza un login correcto y tres fallos (contraseña rechazada, excepción al introducir
la credencial, campo inexistente) y comprueba que ningún marcador aparece en stdout/stderr, JSON, JUnit, HTML (incluido su zip embebido),
adjuntos ni nombres de archivo, en las formas cruda, URL, hex, UTF-16 y base64. El control positivo garantiza que el escáner no es ciego.

## Artefactos que produce una corrida real

| Artefacto | Contenido | Publicable |
| --- | --- | --- |
| `test-results/**/s3-signature-r2-evidence.json` (y adjunto `s3-signature-r2-evidence`) | Evidencia sanitizada session → PUT R2 → complete → attach | Sí |
| Adjuntos `e2e-01-run`, `e2e-02-close-replay` | `runId`, `receptionId`, `orderNumber`, resultado del replay | Sí (IDs sintéticos de prueba) |
| `playwright-report/` | Reporte HTML (solo local; `error-context.md` con texto de página). Sin credenciales (demostrado con marcadores sintéticos), pero con correos/IDs | **No** (local) |
| `e2e/.auth/*.json` | Cookies de sesión de Clerk | **No** (secreto) |

## Defectos y blockers

Defectos encontrados por ejecución: ninguno (no hubo ejecución real).

Blockers de infraestructura para cerrar el gate:

1. **Ambiente de prueba desplegado** con backend en `4c456d9` o posterior compatible, PostgreSQL de prueba migrado y bucket R2 real.
2. **R2 con CORS para el navegador:** el `PUT` firmado lo hace el navegador desde el origen del frontend; el bucket debe permitir ese origen,
   el método `PUT` y las cabeceras de `uploadHeaders` (p. ej. `content-type`). Sin esto E2E-01/06 fallan en el PUT, y el backend (Node) no lo ejercita.
3. **CORS del API** para el origen del frontend (cabeceras `Authorization`, `X-Tenant-Id`, métodos `PATCH`/`POST`) — la aplicación ya lo requiere.
4. **Clerk de prueba (`pk_test_…`)** con tres usuarios de contraseña (asesor A, técnico A, usuario B) cuyas memberships existan en la base
   del ambiente; si Clerk pide verificación en dispositivo nuevo, usar usuarios `+clerk_test` y `E2E_VERIFICATION_CODE`.
5. **Fixtures de dos talleres:** taller A con asesor y técnico (aviso de privacidad configurado, `service_provision` publicado) y taller B con
   una recepción real; los scripts de staging del backend ya trabajan con tenants A/B (`TallerMecarioB/scripts/staging-reception-e2e.cjs`), pero no se invocan desde este repositorio y no crean usuarios Clerk reales para este harness.
6. **Selectores de Clerk sin verificar:** `input[name=identifier]`, `input[name=password]`, botón «Continue» y el campo de código son los del SDK
   en inglés y no se han ejecutado contra una instancia real. Si difieren, ajustar solo `e2e/support/clerk-login.ts`.
7. **Selectores de la aplicación derivados del código fuente actual**, sin ejecución previa en navegador contra backend; la primera corrida real
   puede requerir ajustes menores de textos/roles.

## Verificación local (sin ambiente real)

Node 22.23.3. Ejecutado en este worktree tras el endurecimiento del harness (F1–F7):

| Gate | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint -- --max-warnings 0` | PASS |
| `npm run test` | PASS — 597 tests, 29 archivos (sin cambios en Vitest de producto) |
| `npm run test:e2e:harness` | PASS — 139 tests en 11 archivos (más 14 pruebas de Playwright/Chromium que ese suite lanza contra un formulario local: 13 del suite seguro, 3 de ellas fallos forzados esperados, y 1 de control) |
| `npm run build` | PASS (aviso informativo de Vite por chunk > 500 kB, sin tocar límites) |
| `git diff --check` | PASS |
| `npm run e2e:list` | PASS — 11 tests descubiertos (4 setup, 6 mobile-chromium, 1 desktop-smoke; sin cambios) |
| `npm run e2e:mobile` sin credenciales | Falla a propósito (exit code 1) en `preflight` nombrando las 11 variables ausentes; 9 pruebas «did not run»: comportamiento fail-closed, **no es un PASS del E2E** |
| Corrida real contra infraestructura | **NO EJECUTADA** (real environment pending) |

## CI

- **PR normal** (`.github/workflows/frontend-ci.yml`, sin secretos): typecheck → lint → unit tests (`npm test`, 597) → **`npm run test:e2e:harness`**
  (con `npx playwright install --with-deps chromium` previo) → build → auditoría de dependencias → gitleaks. No depende de Clerk, backend ni R2.
- **E2E real** (`.github/workflows/e2e-mobile.yml`): `workflow_dispatch` únicamente; Environment `e2e-mobile` con las variables/secrets de la tabla de
  variables. Ejecuta `npm run e2e:mobile` sin `continue-on-error`, sin `|| true`, sin `set -x`, sin volcar el entorno y con el código de salida
  intacto; no sube reportes ni artefactos. Si faltan variables, el `preflight` falla; el workflow no simula PASS y no corre en PRs.

## Suite del propio harness (`e2e-harness-tests/`)

`npm run test:e2e:harness` (Vitest en Node + Playwright/Chromium contra un servidor local; **sin** Clerk, backend, R2 ni credenciales) protege el
harness de degradaciones que los 597 tests de producto no ven:

| Hallazgo | Qué se prueba |
| --- | --- |
| F1 | Login sin `fill()`; marcadores sintéticos ausentes en stdout/stderr/JSON/JUnit/HTML(+zip)/adjuntos; errores sanitizados; control positivo del escáner |
| F2 | Envelope `{ signature: {…} }` de attach: válido → `true`; raíz incorrecta → `false`; `signature` vacía → `false` |
| F3 | Cadena session → PUT → complete → attach correlacionada: PUT ajeno / ruta distinta / 500, complete o attach con otra media, otra recepción, orden → no cuentan |
| F4 | Tinta real en el canvas (píxeles): vacío → FAIL, toque → FAIL, trazo extendido → PASS (Chromium táctil, réplica del lienzo de la app) |
| F5 | Placas únicas por corrida, formato `^[A-Z0-9]{1,16}$`, sin colisión; la placa fija se rechaza en el preflight |
| F6 | Paginador: termina, recurso B en página tardía detectado, tope con cursor pendiente / cursor repetido / ciclo → FAIL |
| Preflight y personas | Env sintético completo válido; falta owner / restricted / tenant B / config parcial → error; storageState e identidades distintos; sin fallback entre personas |
| Móvil | `mobile-chromium` exige `hasTouch`, `isMobile` y viewport móvil; en runtime `navigator.maxTouchPoints > 0` y ancho en rango; un navegador de escritorio falla y no hay rama de ratón |
| Workflows | `e2e-mobile.yml`: solo `workflow_dispatch`, sin `continue-on-error` ni `|| true`, ejecuta `npm run e2e:mobile`, sin dump de entorno ni subida de artefactos; `frontend-ci.yml` ejecuta el harness |

Esta suite **no** sustituye al gate real: demuestra que el harness es seguro y que no se degrada, no que el producto funcione.

## DOC_CONFLICT — recepción offline en el gate de Sprint 3 (diferido a Sprint 13)

- **Fuente:** `docs/quality/frontend-relevant-gates.md` §6 «Sprint 3 — Recepción», ítems «Offline: la recepción usa el `privacy_notice_bundle`…», «bundle alterado…», «Tras validar el HMAC…», «El sync usa el snapshot del bundle verificado» (exportación Notion 2026-09-30); `docs/OPEN-QUESTIONS.md` FE-DOC-05.
- **Contrato actual:** el roadmap y la documentación vigente ubican Offline + Sincronización en **Sprint 13** (`frontend-relevant-gates.md` §16); el contrato HTTP de recepción no define bundle offline (`reception-contract.md` §1: «bundle offline de aviso» no existe).
- **Evidencia en conflicto:** la exportación antigua del gate de Sprint 3 todavía lista comportamiento offline de recepción.
- **Resolución:** diferido a Sprint 13. Este PR **no** implementa offline, IndexedDB, bundle ni sync, y el gate móvil de Sprint 3 es online. No se edita el snapshot compartido.
- **Impacto frontend:** ninguno en este PR; los ítems offline no se cubren con este harness. **Impacto backend:** ninguno.

## Decisión

`READY_FOR_GATE`. Acción siguiente: provisionar los fixtures y el CORS de R2 de los blockers 1–5, exportar las variables, ejecutar
`npm run e2e:mobile` y reemplazar los `NOT_RUN` de la tabla por `PASS`/`FAIL` con fecha, commits y ambiente. El gate solo pasa a
`PASSED` con los seis casos (E2E-01 a E2E-06) en `PASS` desde `mobile-chromium` y E2E-03 aceptado como verificación server-side documentada.
