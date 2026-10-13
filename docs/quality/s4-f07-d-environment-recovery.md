# S4-F07-D — Recuperación del entorno E2E existente

> Registro histórico previo a la adaptación a una sola cuenta. Sus requisitos de tres personas/IDs S3 fueron reemplazados por el [preflight S4 vigente](s4-f07-d-real-media-e2e.md). Los probes y resultados aquí descritos conservan su fecha y alcance; no son resultados de una nueva corrida multimedia.

Revisión: 2026-10-11 (fecha de la sesión). Worktree frontend: `/Users/ivanby/Documents/Proyectos/TallerMecario-worktrees/s4-f07-d-real-media-e2e`, rama `task/s4-f07-d-real-media-e2e`, HEAD `5f93740684ae47c481f58e5604f7ec81bc4ba910`; implementación `5de4e2ea3810690a3b213749d3f1d6ec4e820002`.

Checkout frontend principal: `9052f263daaf233508ba5625e86b42c96cefd6bd`. Backend inspeccionado exclusivamente en lectura: `9732aecbda126c100ce9e04e07ea7b9b86e86987`.

La infraestructura de pruebas existente se reconoce conforme a la aclaración del propietario. Los bloqueos siguientes describen su accesibilidad y configuración actual; no prueban ausencia de servicios ni invalidan los PASS históricos.

| Servicio | Configuración localizada | Conectividad | Evidencia actual | Bloqueo |
| --- | --- | --- | --- | --- |
| Frontend F07-D | Variables públicas en `.env` del checkout principal; no están en el proceso ni en el worktree F07-D | HTTP 200 y Chromium `/login` operativo al inyectarlas temporalmente | `clerkLoaded=true`, `loginInputVisible=true`; Node 22.23.3 | Requiere inyección persistente para la próxima corrida; servidor temporal cerrado al terminar |
| Clerk | Publishable key frontend y credenciales backend presentes; claves `pk_test_` / `sk_test_`, publishable keys coincidentes | Frontend API 200 y Backend API `GET /v1/instance` 200 | Instancia Development; authorized parties permite el origen local del frontend; no se inició sesión | Credenciales de las tres personas no localizadas; no hay estados `e2e/.auth` recuperables |
| Backend API | Origen existente en `.env` frontend; `.env` backend presente; CORS configurado para el frontend local | `ECONNREFUSED` | `/health/live`, `/health/ready`, `/api/v1/me` y ruta publicada `/api/v1/media/:id/download-url` no alcanzables | Servicio no alcanzable en el origen configurado; no se inició ni modificó backend |
| PostgreSQL | `DATABASE_URL` y `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` presentes en `.env` backend | No validada; readiness de API no alcanzable | Sin consultas directas ni nuevas bases; `/health/ready` implementa comprobación de conectividad DB | No se pueden acreditar DB de prueba, migrations/fixtures efectivos, memberships ni talleres A/B actuales |
| Cloudflare R2 | Las cinco variables R2 están presentes en `.env` backend y cinco nombres de secretos en Environment GitHub backend `R2` | Endpoint responde; HEAD unsigned raíz 400; OPTIONS PUT y GET/Range 403 | Preflight con `Origin` local, PUT con `content-type,if-none-match`, GET con `range`: sin allow-origin, allow-method ni allow-headers | Preflight CORS actual rechazado. No se usaron claves R2, URL firmada ni objeto real; política exacta y bucket de prueba requieren acreditación del operador |
| Fixtures / runner / CI frontend | PNG y MP4 presentes; los seis specs y cuatro checks setup se descubren | Discovery exit 0; preflight exit 1 antes de ejecutar tests | Sin `.env.e2e`, sesiones ni manifest sandbox; GitHub frontend: cero Environments, secretos y variables de repositorio | Nueve variables de identidad/fixtures y manifest ausentes; los seis escenarios reales quedan sin ejecutar |

## Configuración disponible y origen seguro de variables

Se inspeccionaron el checkout principal, F07-D, restos de `s3-e2e-mobile`, worktrees backend registrados y sus `.env*` de raíz; no apareció `.env.e2e` ni estado `e2e/.auth`. El propietario confirmó que los worktrees de validación anteriores se borraron después de integrar sus cambios. Los archivos ignorados no se recuperan desde los commits. No se consultaron historial de shell, logs privados, almacenes de contraseñas ni PostgreSQL.

Todas las variables relevantes estaban ausentes del proceso inicial. Los archivos principales sí contienen configuración no vacía; sus valores no se imprimieron ni se copiaron a este documento. Se inyectaron en procesos temporales únicamente las variables públicas frontend y el origen R2 derivado, nunca claves backend al navegador.

| Variables del runner | Estado localizado | Fuente para reutilizar sin revelar secretos |
| --- | --- | --- |
| `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY` | Presentes en `.env` principal; ausentes inicialmente del proceso | Cargar ese archivo con Node 22 `--env-file` antes de invocar Playwright, o inyectar únicamente estas variables públicas |
| `VITE_APP_ENV` | Presente en `.env` principal; reutilizada en Vite | Mismo archivo público; no es una variable obligatoria del preflight S4 |
| `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` | Ausentes | Credenciales existentes del asesor/owner de pruebas, suministradas por el propietario desde su almacén privado |
| `E2E_RESTRICTED_EMAIL`, `E2E_RESTRICTED_PASSWORD` | Ausentes | Credenciales existentes de la persona restringida; misma vía privada |
| `E2E_TENANT_B_USER_EMAIL`, `E2E_TENANT_B_USER_PASSWORD` | Ausentes | Credenciales existentes de B; misma vía privada |
| `E2E_TENANT_ID`, `E2E_TENANT_B_ID`, `E2E_TENANT_B_RECEPTION_ID` | Ausentes | Fixtures históricos existentes, verificados con `/api/v1/me`, `/api/v1/me/context` y GET de recepción B tras login autorizado; no inferir IDs desde columnas DB |
| `E2E_S4_R2_ORIGIN` | No estaba en el proceso; derivable de `R2_ENDPOINT` existente | Inyectar solo el origen exacto; ninguna access key R2 pertenece al runner/frontend |
| `E2E_S4_SANDBOX_FILE` | Ausente | Ruta a JSON privado del operador que certifique `environment=test`, `production=false`, `postgresqlFixturesValidated=true` y los tres orígenes exactos; no certificar fixtures sin verificarlos |
| `E2E_BASE_URL` | Ausente; opcional | Puede omitirse para que Playwright arranque Vite en su origen local convencional |
| `E2E_VERIFICATION_CODE`, `E2E_TENANT_B_SENTINEL` | Ausentes; opcionales | Solo si el login/fixture existente los necesita; inyección privada |

`.env.e2e` es ignorado por Git y lo carga `playwright.config.ts`; también puede usarse inyección del proceso. Vite carga `.env` del worktree donde arranca; Playwright no obtiene automáticamente las variables públicas del `.env` de otro checkout. Esta diferencia de carga explica parte del bloqueo original. La secret key Clerk no recupera contraseñas y no sustituye el login UI del runner.

GitHub se consultó en lectura, con salida solo de nombres. Frontend: cero Environments y cero variables/secretos de repositorio. Backend: Environment `R2` contiene `R2_ENDPOINT`, `R2_REGION`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; no variables de ese Environment ni secretos/variables de repositorio. Los valores de secretos GitHub no son recuperables con estas consultas; se inyectan durante un job autorizado. El workflow frontend `e2e-mobile.yml` declara el Environment `e2e-mobile`, pero este no existe actualmente. No se despachó ni modificó CI.

`staging.env.example` backend describe un drill desechable con configuración sintética, no acredita un staging persistente reutilizable para este runner. No se ejecutaron drills que aprovisionen nuevas bases, usuarios o logins.

## Los seis escenarios

| Escenario | Estado actual / precondición pendiente |
| --- | --- |
| S4-01 PNG + MP4, complete, asociación, nueva visita y reproducción | No ejecutado: API, login/fixture A, sandbox y preflight R2 |
| S4-02 replay de asociación sin nueva subida | No ejecutado: depende de S4-01 y su asset real |
| S4-03 aislamiento B y rechazo de persona restringida | No ejecutado: tres sesiones, memberships/permisos actuales y recepción abierta propia B |
| S4-04 archivos locales inválidos y recepción sin media | No ejecutado: API, login/fixture A y sandbox; R2 no es necesario funcionalmente, pero el runner exige su configuración común |
| S4-05 rechazo backend de MIME/tamaño sin PUT | No ejecutado: API, contexto autorizado y sandbox |
| S4-06 expiración de la misma URL temporal | No ejecutado: asset real de S4-01 y GET firmado autorizado; expiración observable por CDP |

Los seis están implementados y descubribles; **0/6 ejecutados en esta revisión**. No hubo test fallido de producto ni PASS real nuevo. El fallo del preflight es de configuración, no un defecto de implementación demostrado.

OPTIONS se probó sin mutaciones: origen exacto local del navegador, bucket configurado y ruta de sonda no existente, sin credenciales ni firma. Los dos 403 sin cabeceras CORS son evidencia real de rechazo para esos requests; no identifican la política exacta ni sustituyen la cadena de una sesión emitida por API. No se hizo PUT ni GET firmado. La documentación oficial de [CORS de Cloudflare R2](https://developers.cloudflare.com/r2/buckets/cors/) confirma que las URLs firmadas requieren CORS para el navegador y que el origen/método/headers deben admitirse. No se modificó ninguna política.

Pendientes de ejecución real: headers firmados exactos (`Content-Type`, `If-None-Match`), PUT de PNG/MP4, completion, asociación, GET/Range 206, `crossOrigin="anonymous"`, URL temporal y reproducción al navegar/regresar. `/health/ready` no comprueba R2 ni demuestra migrations/permisos/fixtures; tampoco bastaría un 200 para certificar esos requisitos.

## Evidencia histórica reutilizada

- Sprint 1: `TallerMecarioB/docs/SPRINT-1-FINAL-QUALITY-GATE.md`, E2E Clerk de 2026-09-25: instancia Development y login real con JWT origin-bound. Sus cuatro usuarios y DB desechables fueron eliminados; no se consideran fixtures actuales reutilizables.
- Sprint 3: `docs/quality/s3-mobile-e2e.md` y registro Git `8d79f34a93a03c2d12ec2fa1b714cc9d205b76e9`: Node 22, origen local de frontend/API, Clerk real, PostgreSQL 18, tres sesiones y tres personas, aislamiento/RBAC. PASS históricos: E2E-01/02/03 y E2E-04/05 + smoke. No se reejecutaron ni convierten R2 en PASS.
- Mismo documento: intento de firma con upload-session 201 seguido de OPTIONS R2 403 `PreflightMissingAllowOriginHeader`; el posterior flujo sin firma no cerró el gate R2 de navegador.
- Backend `docs/S3-R2-EXTERNAL-GATE.md`: pruebas estrictas Node 22 contra R2 real registraron 6/6 local y secretos existentes; ese transporte servidor no acredita CORS de navegador. No se ejecutó su suite porque aprovisiona DB/logins desechables.
- Convenciones vigentes reutilizadas: login UI `signInThroughUi`/`enterSecret`, variables por persona, aislamiento de storage state, un worker/sin retries y traces/screenshots/videos deshabilitados. Evidencia actual solo contiene estados, nombres de variable y booleanos.

## Clasificación y trabajo pendiente

- **Servicio inexistente:** no demostrado para Clerk, API, PostgreSQL ni R2. Environment CI frontend `e2e-mobile` sí está ausente en la consulta actual.
- **Servicio no alcanzable:** API local configurada; frontend inicial apagado, recuperable y comprobado temporalmente.
- **Variable ausente del proceso:** todas las necesarias al inicio; públicas frontend y origen R2 recuperables desde `.env` existentes.
- **Credencial no accesible al agente:** credenciales de las tres personas E2E; sesiones privadas anteriores eliminadas. Claves backend sí existen, pero no sustituyen esas credenciales.
- **Falta de fixture:** IDs y certificación de fixture A/B no disponibles; no se afirma que los talleres/usuarios/recepción hayan dejado de existir. PNG/MP4 sí presentes.
- **Defecto de código:** ninguno demostrado por esta revisión; no se ejecutó la integración completa.
- **Error real de CORS:** OPTIONS PUT y GET/Range 403 sin allow-origin en la sonda actual. Causa/política exacta y cadena firmada pendientes.

Para Sprint 4: hacer accesible la API de pruebas existente; restaurar la inyección privada de credenciales/IDs de fixtures existentes; verificar memberships/permisos y recepción abierta B; acreditar DB/bucket sandbox con el manifest; revisar por el operador CORS del bucket para el origen exacto sin cambios automáticos; ejecutar `npm run e2e:s4` con Node 22 y guardar evidencia sanitizada de los seis escenarios. No se necesitan infra nueva ni nuevas identidades para justificar esta recuperación. Si los fixtures históricos no existen, cualquier aprovisionamiento queda fuera de esta tarea y necesita necesidad demostrada/autorización.

Cambios de esta revisión: únicamente este informe frontend. Sin push, PR, nuevas credenciales ni cambios backend. El servidor frontend temporal y el enlace temporal a dependencias se retiraron. No se declara Sprint 4 PASSED.

S4-F07-D ENVIRONMENT: BLOCKED
