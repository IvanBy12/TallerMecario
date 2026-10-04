# Sprint 3 — Gate E2E móvil (recepción)

## Estado del gate

**Decisión: `READY_FOR_GATE`** — el harness está implementado y verificado estáticamente, pero **NO se ha ejecutado contra
infraestructura real** (backend, Clerk de prueba, PostgreSQL de prueba, R2). Ningún caso está en `PASS`. Que el código E2E exista
no aprueba el gate: el gate se aprueba solo con una corrida real `mobile-chromium` en verde y esta tabla actualizada con su evidencia.

| Campo | Valor |
| --- | --- |
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
| E2E-01 | `e2e/s3-happy-path.spec.ts` | Login → taller activo → Recepciones → Nueva recepción → buscar placa → (crear cliente → crear vehículo → volver) → seleccionar → propietario → consentimiento `service_provision` + atestación de mayoría de edad → km / combustible / observaciones → crear → checklist (agregar y editar) y daño → recarga y persistencia → documento de aceptación real → nombre → lectura → firma dibujada con eventos táctiles reales → registrar → cerrar (diálogo) → «Orden #N» + «Generada correctamente» | Todo el flujo, incluido el trazo de la firma (CDP `Input.dispatchTouchEvent` → pointer events táctiles) | Todos los endpoints de recepción, consentimiento, CRM, media y cierre | NOT_RUN |
| E2E-02 | ídem | Recarga: sigue `Cerrada`, mismo `Orden #N`, sin botón «Cerrar recepción». `POST /receptions/:id/close` reintentado con la sesión del asesor → 200 con el mismo `serviceOrder.id`/`orderNumber`; detalle idéntico antes y después | Estado tras recarga | Reintento real de close (endpoint existente §5.8; el backend lo prueba como «retry is read-only») | NOT_RUN |
| E2E-03 | ídem | Estado inicial de la orden visible (`Estado: Recepción`) | Estado de la orden | `serviceOrder.status = reception` en el detalle. **El historial (`order_status_history`) NO es observable por HTTP/UI en Sprint 3** | NOT_RUN (parcial, ver «Historial») |
| E2E-04 | `e2e/s3-rbac.spec.ts` | El asesor abre una recepción; una sesión real de técnico (sin `receptions.update_open`/`signatures.capture`/`receptions.close` tenant) intenta por UI y por HTTP: PATCH recepción/checklist/daños, GET documento de aceptación, POST firma, POST close, POST crear → todos deben dar **403 `PERMISSION_DENIED`**; después el asesor comprueba que la recepción es idéntica y sigue abierta, sin firma ni orden | Ausencia de acciones; mensajes de permiso | Estado y código de las 7 operaciones + inmutabilidad | NOT_RUN |
| E2E-05 | `e2e/s3-cross-tenant.spec.ts` | Control: la sesión de B lee su recepción real (200). El asesor de A abre `/recepciones/<id de B>`: 404 `RECEPTION_NOT_FOUND`, sin datos ni campos de B. Peticiones reales con la sesión de A: GET con `X-Tenant-Id` A → 404; GET con `X-Tenant-Id` B → 403 de tenant; PATCH no destructivo (token de versión obsoleto) → 404; el listado de A no contiene el ID de B; el recurso de B queda intacto; centinela opcional ausente | Mensaje de recurso no encontrado, ausencia de datos | Estado/código/envelope de cada petición | NOT_RUN |
| E2E-06 | `e2e/s3-happy-path.spec.ts` | Evidencia de red sanitizada del E2E-01: `POST /media/upload-sessions` → `PUT` a R2 → `POST …/complete` (media `active`) → `POST …/signature`, en ese orden; la firma persiste y se ve tras el cierre | Firma registrada | Los cuatro eventos con estado HTTP | NOT_RUN |
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
| `E2E_VEHICLE_PLATE` (opcional) | Placa de un vehículo existente en A; si falta, cada corrida crea cliente y vehículo nuevos |
| `E2E_BASE_URL` (opcional) | Frontend ya desplegado en lugar de `npm run dev` |

La autenticación usa la UI real de Clerk (`<SignIn/>` en `/login`), compatible con el proyecto: no añade `@clerk/testing` ni requiere la
secret key de Clerk en el runner.

## Datos de prueba, aislamiento y limpieza

- Cada corrida genera un identificador único (`newRunId`, base 36, 8 caracteres) y lo usa en: placa `E2E<id>`, nombre del cliente
  `E2E<id> Playwright`, observaciones, código/etiqueta de checklist, nombre del firmante. Son identificables y no colisionan entre corridas.
- E2E-01 y E2E-04 crean su propio cliente, vehículo y recepción (una recepción abierta por vehículo: no se reutilizan). E2E-05 solo lee/rechaza.
- **No hay API pública de borrado** (el contrato declara que no existen cancelar, reabrir ni borrar recepciones; tampoco hay delete de clientes
  o vehículos en este flujo), y no se inventan endpoints de limpieza. Estrategia: el ambiente de prueba debe ser desechable o recreable
  por el equipo de backend (su drill de staging genera y destruye la base); los datos `E2E<id>` se purgan al recrearla. Esta decisión de
  ambiente sigue pendiente de confirmar con backend. El E2E nunca borra
  datos ajenos, y la firma queda en R2 con la retención de evidencia del servicio.
- Las recepciones cerradas de E2E-01 acumulan órdenes numeradas por taller; los números de orden no son deterministas, por eso se leen de la UI.

## Seguridad de los artefactos

- Sin `trace` ni `video` (registrarían `Authorization`, cookies y la URL firmada de R2). Capturas solo ante fallo y **nunca** en el proyecto
  `setup`; ante un fallo de login la página se lleva a `about:blank` antes del snapshot para que no queden correo ni contraseña.
- La evidencia técnica (E2E-06) se genera con `e2e/support/network-evidence.ts`: solo orden, método, ruta con UUID enmascarado, estado HTTP y
  booleanos; el PUT a R2 se registra como «URL omitida». La prueba falla si la evidencia contiene URL, `X-Amz`, `Bearer` o `Authorization`.
- Se verificó empíricamente que `fill()` no imprime su valor en consola/JSON; el único canal que reproduce valores de formulario es el
  `error-context.md` de fallo, cubierto por lo anterior. `e2e/.auth/` (estado de sesión), `test-results/` y `playwright-report/` están en `.gitignore`
  y **no deben publicarse ni subirse como artefactos**.
- El workflow manual tampoco sube reportes: solo imprime en el resumen del job el JSON de evidencia sanitizado.

## Artefactos que produce una corrida real

| Artefacto | Contenido | Publicable |
| --- | --- | --- |
| `test-results/**/s3-signature-r2-evidence.json` (y adjunto `s3-signature-r2-evidence`) | Evidencia sanitizada session → PUT R2 → complete → attach | Sí |
| Adjuntos `e2e-01-run`, `e2e-02-close-replay` | `runId`, `receptionId`, `orderNumber`, resultado del replay | Sí (IDs sintéticos de prueba) |
| `playwright-report/` | Reporte HTML (capturas de fallo, `error-context.md` con texto de página) | **No** (local) |
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

Node 22.23.3. Ejecutado en este worktree:

| Gate | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint -- --max-warnings 0` | PASS |
| `npm run test` | PASS — 597 tests, 29 archivos (sin cambios en Vitest) |
| `npm run build` | PASS (aviso informativo de Vite por chunk > 500 kB, sin tocar límites) |
| `git diff --check` | PASS |
| `npx playwright install chromium` | PASS (Chromium 153 descargado) |
| `npm run e2e:list` | PASS — 11 tests descubiertos (4 setup, 6 mobile-chromium, 1 desktop-smoke) |
| `npm run e2e:mobile` sin credenciales | Falla a propósito en `preflight` (variables ausentes) y 9 pruebas «did not run»; no hay falso verde |
| Corrida real contra infraestructura | **NO EJECUTADA** |

## CI

`.github/workflows/frontend-ci.yml` no cambia: typecheck/lint/test/build siguen sin secretos. El E2E real es **manual y opt-in**:
`.github/workflows/e2e-mobile.yml` (`workflow_dispatch` únicamente; Environment `e2e-mobile` con las variables/secrets de la tabla anterior).
Si faltan, el `preflight` falla; el workflow no simula PASS y no corre en PRs.

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
