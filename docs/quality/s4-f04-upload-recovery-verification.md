# S4-F04 — Upload Progress / Cancel / Retry / Recovery

Fecha: 2026-10-07 (America/Bogota). Repositorio: TallerMecario frontend.
Rama: `task/s4-f04-upload-recovery`.
Base: `0807090500e4a3e303446fb9d8640fe4b2cf4826`.
Alcance: únicamente S4-F04, foundation de ejecución online reutilizable para F05.

## Arquitectura y archivos

| Archivo | Cambio |
| --- | --- |
| `src/shared/media/upload-task.ts` | Controlador observable, guardas por intento, normalización del progreso, recovery y proyección segura de fallos |
| `src/shared/media/upload-task-types.ts` | Unión de estados, progreso, recovery, observer, executor y puerto de transporte |
| `src/shared/media/upload-task-copy.ts` | Copy estático por fase/recovery, reutilizando copy de almacenamiento para errores del archivo |
| `src/shared/media/upload-task.test.ts` | 58 pruebas de ejecución, cancelación, aislamiento, progreso, recovery y disposal |
| `src/shared/media/upload-task-copy.test.ts` | 21 pruebas de copy estable, sin porcentajes ficticios ni detalles privados |
| `src/shared/media/media-client.ts` | Extensión compatible con F01: observer opcional, puerto de transporte y settlement por abort en las etapas |
| `src/shared/media/media-types.ts` | Añade `upload_conflict` al fallo storage existente |
| `src/shared/media/media-errors.ts` | Clasificación específica de 412 y copy neutral |
| `src/shared/media/media-upload.test.ts` | Regresión específica de storage 412, sin leer cuerpos |
| `docs/quality/s4-f04-upload-recovery-verification.md` | Este informe |

El controlador consume `createMediaClient` mediante `UploadExecutor`; no duplica el PUT ni los parsers de sesión/completion. Sigue usando `MediaApiAdapter<Input>`, `ApiClient`, `MediaResult` y `ApiFailure`. No declara endpoints, DTOs de foto/video, límites MIME/tamaño ni garantías del backend. El executor es un puerto de confianza: el proporcionado por `createMediaClient` se resuelve ante abort incluso si el adaptador subyacente no se resuelve. Una implementación alternativa debe conservar esa obligación y las garantías de transporte.

No se añaden dependencias ni cambios de manifest/lockfile. No se modifica backend, recepción, daños, F02/F03, R2/CORS, IndexedDB, service worker, políticas de pagehide/beforeunload ni persistencia. No se añade un componente visual; el modelo y copy quedan disponibles para un consumidor F05.

## Modelo público y uso

Flujo: `idle → preparing → uploading → completing → succeeded`.
Alternativas: `failed`, `canceled`, `ambiguous`, `needs_restart`; `disposed` invalida definitivamente el controlador.

- Estados activos contienen `progress`, discriminado por `determinate`.
- `succeeded` contiene exclusivamente `ConfirmedMedia`: mediaAssetId, status active, sizeBytes y checksumSha256. No hay error, retry ni progreso en ese estado.
- `failed/ambiguous/needs_restart` contienen el fallo seguro y `recovery`.
- `canceled` contiene recovery, sin error/toast por defecto.
- `idle/disposed` no contienen archivo, input, media, error ni progreso.
- No se publica URL firmada, objectKey, cuerpo storage, mensaje de excepción ni requestId. Los fallos API conservan clasificación y status de F01; el controlador omite code/requestId del estado presentable. `rate_limited` conserva `retryAfterSeconds` recibido de ApiFailure, sin otro parser ni timer/retry automático. F01 sigue devolviendo ApiFailure completo a sus consumidores existentes.

API: `getState()`, `subscribe(listener)` con unsubscribe, `start(input, blob)`, `restart(input, blob)`, `cancel()` y `dispose()`. Cada start permitido devuelve `{ ok: true, attempt: { cancel, done } }`; los bloqueados devuelven motivo seguro sin ejecutar requests. Un consumidor puede usar `subscribe/getState` con `useSyncExternalStore`. Debe crear el task fuera del render repetido y disponerlo al desmontar o cambiar identidad/taller. El copy depende de la fase/recovery y permanece estable ante eventos de bytes.

## Identidad de intentos y cancelación

Cada ejecución permitida recibe una generación interna creciente, un registro distinto y su propio AbortController. Todo callback/resultado exige identidad del registro activo, generación vigente y señal no abortada. Las fases sólo avanzan de preparing a uploading y de uploading a completing. Bytes sólo se aceptan en uploading.

El trabajo se difiere a una microtarea para que el handle retornado pueda cancelar antes de cualquier dispatch. El mismo AbortSignal llega a create, PUT y complete. Los checks entre fases impiden PUT/complete si se cancela desde un subscriber en la transición. Cada etapa de `createMediaClient` compite con abort; listeners se retiran en finally y resultados/rechazos tardíos no producen efectos.

Cancelar invalida la generación, publica canceled y aborta la operación. Publicar el estado antes del abort impide que un handler síncrono de abort eluda las guardas de restart. Cancel repetido y cancel posterior al éxito son no-ops; el handle A sólo cancela A y nunca B. Cancelar una solicitud enviada no prueba rollback remoto: recovery mantiene esa incertidumbre.

Dispose invalida el intento, publica disposed, elimina subscribers y aborta; no permite nuevos intentos ni resultados tardíos. El task no almacena un Blob/input para retry: el caller debe resuministrarlos. Durante ejecución sólo se retiene la referencia original, sin lectura completa, hash, base64, clonación de bytes ni persistencia. La carrera de abort permite soltar el contexto de ejecución pendiente; un adaptador/transporte externo puede conservar sus propios argumentos y debe respetar su propia responsabilidad. El task no crea ni revoca previews/object URLs de F02/F03. No se afirma medir garbage collection: se verifica settlement tras abort y ausencia de referencias de archivo/input en estado público y en el registro activo.

## Progreso y decisión de seguridad

**El transporte de producción continúa siendo el fetch seguro de F01 y el progreso de upload es indeterminado. No se implementa progreso de bytes real del navegador.** Preparación y completion son fases, sin porcentajes temporales. No hay XHR, barras ficticias, cálculo por tiempo ni Date.now para decidir vencimiento.

`UploadTransport` es un puerto de confianza para pruebas y futuros transportes aprobados. Recibe sólo sesión transitoria, Blob, señal y callback de bytes; no recibe el cliente autenticado. Actualmente sólo las pruebas inyectan progreso sintético. Una implementación futura de producción requiere revisión que pruebe las garantías de F01; disponer de eventos de bytes no justifica sustituir el fetch por XHR ni añadir una allowlist inventada.

Reglas del progreso determinate: loaded finito y >=0; total finito y >0; loaded clamp a total; ratio loaded/total en [0,1]; loaded no retrocede. El primer total válido queda fijo por intento: cambios de total, conteos inválidos o total desconocido se ignoran, conservando la última medida válida. Si nunca hay un total válido, sigue indeterminate. Un nuevo intento reinicia el progreso. El último evento real de 100% se entrega; bytes no prueban completion ni generan succeeded. No hay throttling adicional: la producción no emite bytes y eventos repetidos/regresivos no notifican subscribers.

`media-upload.ts` y `media-contract.ts` permanecen intactos. Se conserva HTTPS, ausencia de userinfo, rechazo de headers peligrosos/duplicados, headers firmados exactos, credentials omit, redirect error, AbortSignal y supresión del MIME implícito mediante el slice de F01. No se leen cuerpos storage ni se registran URLs/objectKeys. Complete recibe sólo los IDs. Los datos de expiresAt se validan como contrato, sin usar el reloj local para bloquear el PUT.

## Fronteras de retry/restart

**No hay replay automático de create, PUT o complete. Start y restart comparten la misma guarda y no permiten eludir recovery. No se retiene/reutiliza una sesión firmada.**

| Situación | Estado / recovery | Acción local permitida |
| --- | --- | --- |
| Cancel antes del dispatch de create | canceled / safe_local_restart | Start/restart explícito con input y Blob nuevos; nueva generación y señal |
| Create rechazado localmente por no_session, token_offline, token_error o client_bug | failed / safe_local_restart | Corregir la causa y arrancar explícitamente una nueva ejecución |
| Cancel durante create, create HTTP 401/403/409/429/5xx, network/timeout o contrato de sesión inválido | canceled/failed / CONTRACT_DEPENDENCY create_retry | Ninguna repetición automática; no se ha iniciado storage, pero create pudo producir efectos |
| Cancel tras sesión creada, antes del PUT | canceled / CONTRACT_DEPENDENCY create_retry | Conservador: obtener contrato de nueva sesión, no repetir create por haber enviado cero bytes |
| Storage 403 o session_expired | needs_restart / CONTRACT_DEPENDENCY new_session | Enlace/sesión rechazado; no es RBAC y no se afirma vencimiento como causa |
| Storage 412 | needs_restart / CONTRACT_DEPENDENCY new_session | No se repite el PUT ni se afirma por qué existe un conflicto |
| Storage 413/415/422 | failed / user_action | Revisar/cambiar archivo; no repetir esta ejecución. El consumidor usará un task nuevo para un archivo corregido |
| PUT network, redirect inesperado, respuesta inesperada o abort externo | ambiguous / CONTRACT_DEPENDENCY reconciliation | El objeto pudo llegar; no replay |
| Cancel durante PUT, tras PUT y antes de complete, o durante complete | canceled / CONTRACT_DEPENDENCY reconciliation | Se detiene trabajo local; no prueba inexistencia del objeto ni rollback |
| Complete network/timeout/5xx/contract_violation/redirect/abort externo o DTO inválido | ambiguous / CONTRACT_DEPENDENCY reconciliation | Puede haberse confirmado remotamente; no se afirma “Upload failed” ni se repite complete |
| Complete con rechazo API conocido, p.ej. 401/403/409/429 | failed / CONTRACT_DEPENDENCY reconciliation | Conservar clasificación/status y Retry-After cuando aplique, sin replay |
| Éxito confirmado | succeeded | Cancel no-op; start/restart rechazado |

Create network/timeout no se convierte en ambigüedad de storage: se expone failed con dependencia explícita de create_retry. Complete 5xx/contrato inválido se trata conservadoramente como resultado incierto. La clasificación local de preflight reutiliza las garantías del ApiClient existente (sin request para esas causas); un adaptador futuro debe preservarlas. No se implementa un desbloqueo especulativo tras reconciliación. Ese contrato corresponde a Track A/F05.

## Pruebas y evidencia

79 pruebas nuevas: 58 en upload-task y 21 en copy. Una prueba adicional de 412 en el transporte existente lleva F01 a 85 pruebas; conjunto focalizado total: 164 en 5 archivos.

Cobertura: fases y resultado confirmado reducido; cancel antes de dispatch, durante create/PUT/complete, en transiciones y después de éxito; abort prompt con adaptadores que no resuelven; late create/PUT/complete/progress; generación y handles antiguos; progreso monotónico, overshoot, inválido/desconocido/cambio de total y evento final; storage 403/412/413/415/422/500/network; API create 401/403/409/429/503/network/timeout/contrato/preflight; complete rechazos conocidos, timeout/network/5xx/contrato inválido; no replay; dispose en las tres etapas; subscriptions; copy y ausencia de datos privados; seguridad de PUT; reentrancia de abort y ausencia de regresión de fase.

El test A uploading → cancel → B con callbacks tardíos usa un executor **sintético sin dispatch de red** para aislar la guarda de identidad y permitir un restart local. Un A real cuyo PUT fue enviado bloquea B por CONTRACT_DEPENDENCY; las pruebas también verifican ese bloqueo. No se inventa una vía para saltarlo.

### Gates ejecutados

Runtime: Node v22.23.3; .nvmrc 22, engines >=22.22.2 <23.
Se reutilizó el worktree limpio ya existente de la rama solicitada. Para los gates se usó un enlace temporal al node_modules instalado del checkout principal; no se modificaron dependencias/lockfile. El enlace se elimina antes de commit. No se crearon worktrees/audits dentro del repositorio.

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; cero warnings |
| `npm test -- src/shared/media/upload-task.test.ts src/shared/media/upload-task-copy.test.ts src/shared/media/media-client.test.ts src/shared/media/media-upload.test.ts src/shared/media/media-contract.test.ts` | Exit 0; 164/164, 5 archivos; incluye rerun F01 (85/85) |
| `npm test` | Exit 0; 833/833, 41 archivos |
| `npm run test:e2e:harness` | Exit 0; 191/191, 11 archivos |
| `npm run build` | Exit 0; 175 módulos; warning existente de chunk >500 kB (543.91 kB principal) |
| `git diff --check` | Exit 0 |
| `git status --short` | Sólo archivos de esta tarea antes del commit; status final y hash se reportan en la entrega |

Lint detectó inicialmente el estrechamiento de signal.aborted como inmutable; se mantuvo el helper isAborted de F01 para comprobar cambios tras callbacks/await. Ese primer intento falló y no se cuenta como aprobado. Todos los gates anteriores corresponden a la versión final del código.

**No se ejecutó E2E real browser → R2 ni integración con Clerk/backend/CORS para fotos/video.** El harness existente usa fixtures sintéticas; no prueba upload UI F04, bytes reales de navegador, R2 ni CORS. Las pruebas del transporte/progreso son unitarias con respuestas y eventos sintéticos. No se afirma progreso real R2.

## CONTRACT_DEPENDENCY

Referencias: docs/OPEN-QUESTIONS.md FE-DOC-08 y docs/api/reception-and-media-contract-status.md. Los snapshots/columnas/diagramas no son contratos HTTP ni prueba de endpoints desplegados.

- Semántica de retry seguro de create-session y su idempotencia.
- Idempotencia de complete y reconciliación de completion ambiguo.
- Reconciliación de PUT ambiguo y garantías para repetir PUT dentro de la misma sesión.
- Comportamiento seguro tras 412, sin asumir causa del conflicto.
- Si corresponde crear nueva sesión tras 403/expiry y bajo qué condiciones.
- Límites canónicos MIME/tamaño/duración para fotos/video.
- Contratos reales de MediaApiAdapter de fotos/video: paths, bodies, DTOs, envelopes, errores y contexto autorizado.
- R2 CORS y evidencia real de infraestructura/browser → R2.
- Estrategia de progreso de bytes de producción que conserve credentials omit, redirect error y headers exactos.

Estas dependencias bloquean automatismos inseguros e integración posterior, no la foundation S4-F04. Entrega: un commit local de implementación en la rama indicada, sin push ni PR. Base, head, hash y status posteriores se incluyen en el reporte final.
