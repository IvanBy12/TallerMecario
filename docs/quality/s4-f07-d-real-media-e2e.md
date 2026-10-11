# S4-F07-D — Real Media Integration & E2E

Fecha: **2026-10-11, America/Bogota**. Responsable: Codex, frontend.
**S4-F07-D: READY_FOR_REVIEW** por preparación y verificación local del runner.
**S4 REAL E2E: BLOCKED / NO EJECUTADO**. **Sprint 4: NOT_READY**.
Ningún resultado sintético se contabiliza como integración real ni como aprobación
del Quality Gate. No hubo push, PR, merge, deploy, cambio backend o política R2.

## Revisión y ambiente

- Worktree solicitado: `/Users/ivanby/Documents/Proyectos/TallerMecario-worktrees/s4-f07-d-real-media-e2e`.
- Rama: `task/s4-f07-d-real-media-e2e`; existente y limpia al comenzar.
- Base frontend: `9052f263daaf233508ba5625e86b42c96cefd6bd`.
- Commit de implementación verificada: `5de4e2ea3810690a3b213749d3f1d6ec4e820002`.
- Este informe se entrega en un segundo commit documental, identificable mediante
  `git log -1 -- docs/quality/s4-f07-d-real-media-e2e.md`; el HEAD final se informa en el handoff.
- macOS, Node **22.23.3**, npm **10.9.9**, compatibles con `.nvmrc` y engines.
  Dependencias fijadas ya instaladas en el checkout principal: enlace temporal
  de `node_modules`, retirado al entregar. Sin paquetes ni lockfile nuevos.
- Backend de referencia, solo lectura: TallerMecarioB
  `b5f192f7f539192e28adee98a88d7f1a2cb1fdcf`. Sin SQL directo ni pruebas backend.
- Checkout principal frontend y backend: limpios antes y después del trabajo.

Se inspeccionaron AGENTS y módulos aplicables, `.env.e2e.example`, configuración
Playwright, `e2e/`, soportes, suites del harness, recepción/media productivos,
CI, [gate S3](s3-mobile-e2e.md), [gate F07-C](s4-f07-c-media-final-gate.md),
OPEN-QUESTIONS y contratos publicados. No se dedujo implementación de diagramas.

Fuente canónica leída mediante Notion:
[Quality Gates — Reglas y Pruebas por Sprint](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573),
§7 (24 criterios), §21 (test obligatorio no ejecutado → NOT READY) y §22.
`page_last_edited_at=2026-10-06T01:53:14.555Z`, `verification.state=unverified`;
no se observaron indicadores de truncación/bloques desconocidos. Lectura de esta
sesión, sin escrituras Notion. Sus casillas S4 siguen pendientes.

## D0 — Dependencias observadas

«BLOCKED» indica falta de provisión/evidencia **para este runner**. No afirma que
la infraestructura global no exista. No se imprimieron valores de configuración.

| Dependencia | Disponible/evidencia | Estado para E2E real |
| --- | --- | --- |
| Origen frontend | Build y configuración local preparados; fallback `http://localhost:5173`; ningún servidor de prueba iniciado | BLOCKED: origen desplegado/provisionado no verificado |
| API operacional | Contratos/adaptadores presentes; `VITE_API_BASE_URL` ausente | BLOCKED: no se hizo probe remoto |
| Clerk | Login UI reutilizable; `VITE_CLERK_PUBLISHABLE_KEY` ausente | BLOCKED: instancia de prueba y login no verificados |
| Usuarios/memberships | Soporte existente de tres personas; correos/contraseñas privados ausentes | BLOCKED: no memberships reales certificadas |
| Tenant A y B | Aislamiento configurado en runner; IDs y recepción de B ausentes | BLOCKED |
| PostgreSQL/fixtures | Sin declaración de aprovisionamiento ni identidad API para confirmar contexto | BLOCKED: ninguna conexión SQL, migración o fixture DB ejecutada |
| Bucket R2 de pruebas | Sin `E2E_S4_R2_ORIGIN` ni declaración sandbox | BLOCKED: identidad y uso exclusivo de pruebas no certificados |
| Credenciales sandbox | Credenciales Clerk ausentes; credenciales storage pertenecen al backend, nunca al bundle/runner frontend | BLOCKED: material y permisos efectivos no verificados |
| CORS PUT/GET/Range | Colector CDP probado con servidores **locales sintéticos** | BLOCKED real: ninguna solicitud R2 |
| Permisos signed URLs | Preflight preparado para `media.upload/read` tenant y tres identidades | BLOCKED: sin sesión/API/R2 reales |
| Foto/video360 | PNG 6798 bytes, MP4 AVC/H.264 4492 bytes; ambos 320×180; duración MP4 1.532367 s; decode/playback Chromium local PASS | AVAILABLE local; upload remoto BLOCKED |
| Chromium | Instalado, bundle 1243; ejecutado en harness | AVAILABLE local; ningún dispositivo físico certificado |

No `.env.e2e` ni `.env.local` en el worktree, ni `.env.e2e` en el checkout principal.
El proceso no tiene ninguna de las 11 variables obligatorias del runner S3:
`VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `E2E_TENANT_ID`,
`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_RESTRICTED_EMAIL`,
`E2E_RESTRICTED_PASSWORD`, `E2E_TENANT_B_ID`, `E2E_TENANT_B_USER_EMAIL`,
`E2E_TENANT_B_USER_PASSWORD`, `E2E_TENANT_B_RECEPTION_ID`.
`E2E_BASE_URL`, `E2E_S4_R2_ORIGIN` y `E2E_S4_SANDBOX_FILE` tampoco están
provisionados. `E2E_BASE_URL` es opcional si se usa Vite local.

Antes faltaban selección S4, fixtures binarias, correlación operacional y evidencia
GET/Range/OPTIONS. CI ya ejecuta el harness sin credenciales; el workflow manual
existente sigue siendo S3 y no certifica S4. No se agregó CI real sin entorno.

## Contratos consumidos

Backend en el SHA de referencia anterior:
[B01](https://github.com/IvanBy12/TallerMecarioB/blob/b5f192f7f539192e28adee98a88d7f1a2cb1fdcf/docs/S4-B01-media-contract.md),
[B04 Phase A/B](https://github.com/IvanBy12/TallerMecarioB/blob/b5f192f7f539192e28adee98a88d7f1a2cb1fdcf/docs/S4-B04-media-associations.md),
y DTOs/clientes aprobados frontend F07-A/B/C. Identidad/contexto: contratos
`GET /api/v1/me`, `/api/v1/me/context` ya usados en S3.

| Operación | Request / éxito / límites |
| --- | --- |
| Create contextual | POST `/api/v1/media/upload-sessions`, mediaType, mimeType, retentionClass=operational, expectedSizeBytes, idempotencyKey UUID, operationalContext={type:reception,receptionId}; 201 pending con sesión/asset/PUT firmado |
| PUT | Navegador → endpoint R2 exacto; conservar uploadHeaders, incluidos Content-Type y If-None-Match cuando se emiten; sin Authorization/X-Tenant-Id/Cookie |
| Complete | POST `/api/v1/media/upload-sessions/:uploadSessionId/complete`, `{}`; 200 active del mismo asset, tamaño exacto |
| Attach | POST `/api/v1/receptions/:receptionId/media`, mediaAssetId y sortOrder; 201 `{media:MediaDto}` con purpose intake_evidence; replay mismo enlace/sort no crea otro enlace |
| List | GET `/api/v1/receptions/:receptionId/media`, sin query, 200 `{media:MediaDto[]}`, no-store |
| Download | GET `/api/v1/media/:mediaAssetId/download-url`, 200 mismo asset + downloadUrl + expiresAt; no-store, TTL máximo 300 s |
| Archivos | Photo PNG permitido, ≤20,971,520 bytes; video360 MP4 permitido, ≤786,432,000 bytes; no máximo numérico de duración inventado |

**DOC_CONFLICT histórico:** `docs/api/reception-and-media-contract-status.md`
aún dice «pendiente de Track A» en el snapshot 2026-09-30; evidencia específica
B01/B04 y adaptadores integrados F07-A/B/C publican ahora los contratos de la tabla.
Resolución: usar los contratos específicos aprobados; no editar snapshots compartidos.
Impacto frontend: runner consume DTOs existentes. Impacto backend: ninguno.
FE-DOC-08 se resuelve para este transporte/asociación/lectura; duración numérica,
assignment técnico y otros dominios requieren sus propios contratos/gates.

## D1 — Runner preparado

- `playwright.s4.config.ts` hereda `playwright.config.ts`: un worker, retries=0,
  política existente trace/screenshot/video off, mismos timeouts/device y Vite opcional.
  S3 conserva sus proyectos/scripts/CI. S4 usa únicamente reporter list.
- Preflight **al cargar configuración**, antes de webServer/browser/login, también
  con `--no-deps`: nombres obligatorios, Clerk pk_test, identidades/tenants distintos,
  orígenes seguros, endpoint R2 HTTPS independiente, fixtures y declaración sandbox.
  `--list` solo inventaría los casos y nunca significa ejecución.
- `s4.setup.ts` reutiliza login UI real de Clerk, `env.ts`, rutas de storageState
  y personas. Comprueba /me/context, exactamente una membership esperada y permisos
  S4; asesor necesita CRM/recepción/media; B necesita media tenant y recepción propia
  abierta; restringido no puede tener media tenant. Sin exigir firma digital S3.
- La declaración privada `E2E_S4_SANDBOX_FILE` debe contener environment=test,
  production=false, postgresqlFixturesValidated=true y frontendOrigin/apiOrigin/r2Origin
  exactamente iguales a la configuración. Es evidencia del **operador**, no verificación
  independiente del backend, bucket, CORS o permisos. Debe respaldarse con provisión real.
  Secretos R2 permanecen en el backend. El archivo no se versiona.
- `s4-media-evidence.ts` reutiliza formato/sanitizador de red existente, correlaciona
  cuerpos/IDs y digest de capacidades solo en memoria. Persiste exclusivamente rutas
  conocidas con IDs enmascarados, método, orden, status y booleanos. Descarta valores
  de credenciales y headers innecesarios. Fallos de captura son explícitos.
- CDP observa OPTIONS nativo (Page response lo omite); se comprueban headers firmados,
  ACAO del origen exacto y permiso efectivo. GET de video requiere Range/206.
- `s4-safe.ts` sustituye excepciones con mensajes fijos, sin cause/call log sensible;
  limpia la página antes de reporters/error-context, también en teardown de setup/specs.
  Si no puede navegar a blanco, cierra el contexto. Evidencia HTTP del flujo se adjunta
  sanitizada incluso si falla. Sesiones quedan en `.auth` ignorado, archivos modo 0600;
  no se suben reportes/artefactos autenticados.
- El spec real no contiene route mocks, reemplazo de HTTP, modo offline ni reintentos
  automáticos de mutaciones. Las fixtures son archivos sintéticos, no archivos del usuario.

## D2/D3 — Matriz de ejecución real

| Caso | Preparación / criterio observable | Resultado real de esta sesión |
| --- | --- | --- |
| Preflight/login (4 tests) | Sandbox + tres sesiones Clerk; memberships/contexto/permisos del servidor | BLOCKED / NO EJECUTADO |
| S4-01 positivo | Cliente/vehículo únicos por corrida → consentimiento y adulto → selección previa → recepción nueva → photo/video360 → session → PUT → active → attach → salir/regresar → list → Ver → foto decodificada y video reproduciendo; OPTIONS, headers, no credenciales R2, no prefetch, GET/Range, ocultar libera vista | BLOCKED / NO EJECUTADO |
| S4-02 replay | POST attach explícito del mismo asset/sort; lista idéntica y cero PUT adicionales; no certifica filas/auditoría DB | BLOCKED / NO EJECUTADO |
| S4-03 aislamiento/RBAC | B tiene permiso media propio, recibe 404 para media/list A y attach de asset A a B; restringido recibe 403; respuestas no entregan capacidades; detalle permanece intacto comprobado por lector autorizado | BLOCKED / NO EJECUTADO |
| S4-04 archivo local inválido | Text/plain y PNG vacío rechazados; cero upload sessions; recepción sin esos archivos se crea | BLOCKED / NO EJECUTADO |
| S4-05 validación backend | MIME photo text/plain y photo 20,971,521 bytes → 422/MIME_TYPE_NOT_ALLOWED o MEDIA_SIZE_TOO_LARGE, sin URL ni PUT | BLOCKED / NO EJECUTADO |
| S4-06 GET expirado | GET 200 de capacidad nueva; esperar expiresAt real +2 s (hasta 300 s); mismo digest de URL obtiene 403 R2 real. CDP distingue 403 incluso cuando CORS filtra el fetch; TypeError por sí solo no aprueba | BLOCKED / NO EJECUTADO |

Los seis escenarios están en `e2e/s4-media.spec.ts`, seriales: 02/03/05/06 usan
solo la recepción recién creada por 01 en esta corrida; no se restaura una recepción
abierta anterior. 04 crea su propio vehículo/recepción. Si 01 falla, los dependientes
no son PASS. Para ejecución completa no filtrar únicamente los casos dependientes.

### Negativos adicionales: protocolo preparado y dependencias

No se automatizó alteración del entorno compartido para fabricar resultados. Los
siguientes son **BLOCKED / NO EJECUTADOS**, no cobertura real aprobada. Se solicita
un entorno aislado y fixtures/procedimiento del responsable de plataforma/backend
para los fallos que afecten servicios, permisos o lifecycle; no autorización implícita
para modificar infraestructura, políticas R2 o datos compartidos.

| Escenario | Acción/evidencia requerida al desbloquear | Responsabilidad/límite |
| --- | --- | --- |
| CORS origen no autorizado | Navegador desde segundo origen controlado con capability de asset sintético propio; OPTIONS denegado, no PUT efectivo; registrar solo status/facts | Plataforma: origen aislado y política existente; no cambiar CORS para PASS |
| PUT firma expirada | Sesión nueva propia, esperar vencimiento firmado real (máximo publicado 900 s), PUT denegado; asset no active/attach | Backend/storage + navegador; no acortar artificialmente TTL ni usar asset ajeno |
| PUT headers incompatibles | Sesión nueva propia; cambiar únicamente Content-Type o If-None-Match firmado; denegación y ausencia de completion/attach exitoso | Storage verifica firma; assets desechables/limpieza server-owned |
| PUT interrumpido | Archivo sintético suficientemente grande en entorno aislado; cancelar UI durante PUT real; recepción guardada; sin retry automático/duplicado | Frontend cancelación + backend reconciliación; la fixture pequeña positiva no prueba interrupción |
| Completion ambiguo | Pérdida real controlada de conexión tras dispatch/commit; UI conserva recepción y no repite PUT/complete; confirmar estado server-side con contrato publicado | Necesita entorno/fault drill aislado aprobado; no route mock ni DTO de reconciliación inventado |
| Asociación fallida / retry UI | Fallo real después de active; UI conserva asset activo y ofrece Reintentar asociación; acción explícita solo attach, no session/PUT nuevo | Drill aislado aprobado; S4-02 prueba replay del endpoint, no esta recuperación UI completa |
| Revocación | Revocar membership/permiso de identidad desechable con procedimiento backend autorizado; reconsulta denegada y estado UI liberado | Backend autoridad; no modificar personas del entorno compartido |
| Media eliminada/inaccesible | Fixture preprovisionada con lifecycle/marcadores correspondientes; list/download seguros, detalle de recepción intacto | Backend/storage; no llamar DELETE/purge desde esta tarea ni inventar fixtures de producción |
| R2 indisponible | Drill real aislado del proveedor; fallos visibles, recepción intacta, sin replay automático | Plataforma; no desconectar bucket/API compartidos |

Validaciones independientes backend siguen necesarias: autorización/anti-oráculo y
FK/RLS reales; atomicidad/OCC/idempotencia/auditoría; integridad/HEAD/checksum y
contenido inválido; lifecycle/deletion markers; retención, legal hold, purge, scan
y consulta de evidencia por orden. No se certifican con booleans o mocks frontend.

## D4 — Pruebas efectivamente ejecutadas

| Comando / comprobación | Resultado | Evidencia y alcance |
| --- | --- | --- |
| npm run typecheck | PASS | Código frontend + configuración/specs/harness S4; Node fijado |
| npm run lint | PASS, 0 warnings | Sin supresiones; error propio sanitizado sin adjuntar cause sensible |
| npm test | PASS **1315/1315**, 48 archivos | Regresión producto sintética; src/ no cambia |
| npm run test:e2e:harness | PASS **222/222**, 12 archivos | 191 existentes +31 S4; servicios locales sintéticos y Chromium; controles negativos existentes conservados |
| npm run build | PASS | Build local; warning existente de chunk >500 kB (644.12 kB); sin deploy |
| git diff --check / --cached --check | PASS | Higiene de implementación y documento |
| npm run e2e:s4:list | Inventario **10 tests** / 2 archivos | 4 preflight/login +6 escenarios, ningún test real ejecutado |
| npm run e2e:s4 con env ausente | **BLOCKED**, exit 1 esperado | Config rechazó 11 variables y 2 dependencias S4; antes de browser/webServer/login/mutaciones |
| Config real con --no-deps, entorno sintético incompleto | PASS del control de bloqueo | Dos procesos Playwright hijos: exit 1/BLOCKED; claves sintéticas no aparecen en salida; no «Running tests» |
| Clerk/API/PostgreSQL/R2 reales | **BLOCKED / NO EJECUTADO** | Cero evidencia HTTP remota nueva; no autenticación ni operación remota realizada |

Los 31 tests S4 comprueban fallos de identidad/asset/session, headers incompatibles,
credenciales al storage, CORS, Range, captura incompleta y serialización sin IDs,
capabilities o cuerpos. Un test Chromium usa **dos servidores HTTP locales sintéticos**:
preflight nativo, PUT, GET/Range, decodificación PNG/MP4 y reproducción, GET primero
200 y después 403 sin ACAO, y excepción con marcador sensible que termina con
mensaje fijo/página en blanco. Esto demuestra el colector y sus fixtures; nunca R2 real.
El registro HTTP persistible permite método/ruta/status/credentialsAbsent; no se
incluye un ejemplo inventado de HTTP R2 real en este documento.

Defectos: no defecto productivo o de proveedor validado (sin entorno real). Los
fallos iniciales de tipos/lint/parametrización del harness se corrigieron y todas
las suites finales citadas pasaron. No se deshabilitó ninguna prueba. La política
existente del harness mantiene sus fallos deliberados dentro de sus assertions;
no son fallos de producto ni skips contados como PASS.

## Desbloqueo y decisión

1. Provisionar origen frontend/API, Clerk de prueba, tres identidades y fixtures
   tenant A/B con recepción abierta propia B, y PostgreSQL válido. Asesor y B con
   permisos tenant de media; restringido sin ellos. Credenciales solo privadas.
2. Responsable del entorno entrega declaración sandbox con los tres orígenes
   exactos y evidencia de bucket exclusivo de pruebas, credenciales/permissions,
   CORS PUT/GET/Range y fixtures DB. Completar `.env.e2e` ignorado; instalar Chromium
   si falta. Instalar dependencias fijadas con `npm ci` y, si hace falta,
   `npx playwright install chromium` antes del runner. La declaración sola no
   demuestra integración ni convierte el gate en PASS.
3. Desde este worktree, ejecutar `npm run e2e:s4:list` para inventario, luego
   `npm run e2e:s4`. Preflight está incluido: no forzar PASS ni publicar reportes,
   sesiones, snapshots/DOM o binarios/URLs de usuarios. S4-06 espera TTL real.
4. Incorporar evidencia HTTP sanitizada de la corrida y resultados por caso,
   commit/ambiente/fecha; si falta cualquier dependencia mantener BLOCKED.
5. Ejecutar los drills adicionales únicamente con entorno/procedimiento aislado
   autorizado, y reunir evidencia independiente backend del gate global.

Entrega local lista para revisión independiente. El entorno impide ejecutar el
E2E real; no impidió preparar y verificar el runner. Sprint 4 permanece **NOT_READY**
por E2E obligatorio no ejecutado y criterios backend pendientes de evidencia,
incluidos retención/legal hold/purge/scan y vista de medios por orden.

**S4-F07-D: READY_FOR_REVIEW**

**S4 REAL E2E: BLOCKED**
