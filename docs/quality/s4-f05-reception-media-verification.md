# S4-F05 — Reception / Damage Media Integration

Fecha: 2026-10-08 (America/Bogota). Repositorio: TallerMecario frontend.

## Base y head

- Base: `8d5586b183b0df42f0a70bea182b9bf991f47a5d` (main, F04 merge).
- Rama/head: `task/s4-f05-reception-media`, un único commit sobre esa base que incluye este informe. El hash final se entrega en el reporte de la tarea; resolver con `git rev-parse HEAD`.
- Worktree existente reutilizado: `/Users/ivanby/Documents/Proyectos/TallerMecario-worktrees/s4-f05-reception-media`.
- Node ejecutado: `v22.23.3`, compatible con `.nvmrc` 22 y engines `>=22.22.2 <23`. Sin cambios de dependencias/lockfile. Para los gates se reutilizó node_modules del checkout principal mediante un enlace temporal, retirado antes del commit.
- Sin push, PR, backend, R2/CORS ni persistencia/offline nuevos.

## Inventario de contratos antes de implementar

Se inspeccionaron `docs/api/`, `docs/architecture/`, FE-DOC-07/08/09 de `docs/OPEN-QUESTIONS.md`, reglas aplicables, catálogo de permisos, `src/shared/media/`, `src/features/reception/`, los adaptadores existentes y los informes F01–F04.

| Clasificación | Evidencia / conclusión |
| --- | --- |
| AVAILABLE | F01: MediaApiAdapter genérico, MediaClient, parsers de sesión y ConfirmedMedia, PUT seguro. F02/F03: pickers, identidad local y previews. F04: task, progreso y recovery. Son puertos reutilizables, no aprobación de nuevos HTTP DTOs. |
| AVAILABLE | Adaptador de recepción existente: propietario/consentimiento/aviso, create/detail/inspection/workflow. ReceptionProvider normaliza grants y aborta sesiones. `receptions.create`, `media.upload` y scopes tenant existen en el catálogo. |
| AVAILABLE, limitado | `createSignatureUpload` tiene POST `/api/v1/media/upload-sessions` con `mediaType=signature`, `retentionClass=authorization_evidence`, MIME image/png, size e idempotencyKey. Complete de firma: POST `/api/v1/media/upload-sessions/:id/complete` con `{}`; asociación exclusiva `/api/v1/receptions/:id/signature`. Estas operaciones no son contratos de fotos/video y siguen ausentes del UI activo de firma. |
| MISSING / BLOCKING | Adaptador real para fotos/video; create/complete y envelopes aprobados para ese caso; valores HTTP de mediaType y retentionClass, límites MIME/bytes/duración. Los enums SQL no son DTOs. |
| MISSING / BLOCKING | Asociación reception-media y damage-media, permisos/scopes concretos por operación/recurso. Sin asociación legítima no se crea media huérfana. |
| MISSING / BLOCKING para cada subfeature | List/fetch/signed read/download, delete/remove remoto, orden del servidor, identificador/endpoint de reconciliación y garantías de retry/new-session. No se fabrican fixtures de producción, paths ni sort_order. |
| NON-BLOCKING para captura local | R2/CORS, progreso real de bytes en browser, integración backend y política de cerrar/continuar con media pendiente o ambigua. Sí bloquean sus respectivas funcionalidades remotas. |

DOC_CONFLICT documental: `docs/api/reception-and-media-contract-status.md`, párrafo PENDIENTE DE TRACK A, conserva una instantánea que declara pendiente recepción S3; el adaptador/DTOs/pruebas e informes S3 ya existen. Se conserva la fuente histórica sin reescribir contratos: se reutiliza el código de recepción vigente y se mantiene bloqueado el nuevo HTTP de fotos/video. Impacto frontend: solo UI local y puertos existentes; impacto backend: ninguno. No se extrapolan contratos de firma ni columnas SQL.

## Integración implementable

`NewReceptionPage`, ruta `/recepciones/nueva`, incorpora `ReceptionMedia` entre la autorización y el formulario de ingreso. No crea otra página. Requiere vehículo/propietario validados y consentimiento server-issued granted para service_provision. El panel consulta el aviso mediante `ReceptionApi.notice`, muestra texto exacto y responsable/canal, exige declaración adulta no premarcada y conserva además las advertencias independientes de F02/F03.

El detalle existente añade únicamente el estado honesto de dependencia de lectura/asociación. No habilita nueva captura sobre un detalle sin contrato de elegibilidad ni representa una lista vacía como lectura exitosa. Checklist, daños, cierre y firmas históricas mantienen sus operaciones existentes; no vuelve la captura de firma digital.

Permisos: `receptions.create` + `media.upload`, ambos scope tenant con `can` compartido. Assigned no prueba acceso al recurso y no habilita esta captura general. No se inventa permiso ni parser RBAC. Los grants de lectura/captura de consentimiento y CRM siguen regidos por el flujo de recepción existente. La normalización existente preserva selecciones en refreshes semánticamente equivalentes; revocaciones remount/abort impiden ejecución, incluso tras seleccionar.

## Ownership, identidad y lifecycle

- F02/F03 conservan los únicos estados de selección con Files y los únicos propietarios de URLs. Se añaden slots de presentación sin duplicar picker, validación, metadatos ni lógica de foco. F05 conserva únicamente contadores/referencias de IDs, orden local y metadata confirmada; no guarda árboles independientes de Files ni base64.
- Cada selección tiene su propio componente/task F04. El File se pasa al executor únicamente al iniciar explícitamente. Handles de cancelación quedan ligados al intento que los originó. F04 libera payload al completar, fallar, cancelar o disponer.
- Máximo dos uploads explícitos simultáneos, compartidos entre fotos/video; Set de permisos locales de ejecución, sin scheduler, queue, Promise.all masivo ni auto-dispatch. Permite aislar cancelaciones/completions fuera de orden con un límite pequeño. La producción actual no inicia uploads porque no recibe executor.
- Se consume directamente UploadTaskState/UploadRecovery y uploadTaskCopy: local, preparing/uploading/completing, confirmed active, failed, ambiguous, needs_restart, canceled. Progreso indeterminado carece de value; solo eventos reales proporcionan ratio. Live copy por fase no anuncia cada byte.
- PUT 2xx, complete enviado o 100% no significan guardado. F01 parsea active e identidad; F05 vuelve a validar el resultado antes de mostrar Confirmado activo. Un resultado malformed queda ambiguous. Confirmación añade metadata remota por mediaAssetId y retira selección local en una actualización batched, sin miniatura duplicada ni preview remoto inventado. Los confirmados conservan orden de selección de esta sesión, sin alegar orden de servidor.
- Solo safe_local_restart habilita Reiniciar carga; user_action pide quitar/cambiar; contract_dependency/reconciliation bloquea replay. Storage 403 no se traduce a RBAC, 412 no permite misma sesión y 413/415/422 conservan preview para decidir cómo cambiarlo. No rollback remoto supuesto al cancelar.
- Cancel A no afecta B; resultados y callbacks tardíos no cambian otro item. Un mismo File o filename seleccionado dos veces conserva IDs distintos. Video está aislado y F03 sigue permitiendo un único video local, reemplazado atómicamente.
- Unmount/remoción, nueva identidad de vehículo/propietario/consentimiento, identidad de usuario o taller y cambio real de permisos limpian selección/URLs, unsubscribe, dispose y abort. Señales abortadas y generaciones F04 impiden resultados del contexto anterior. No hay continuación de upload prometida tras navegar.
- Foco: F02/F03 mantienen remove/reset. Cancel vuelve al restart permitido o a su estado; confirmación enfoca la lista confirmada solo si eliminó el control enfocado, sin robar foco movido por el usuario.

## Continuar / crear / cerrar

La evidencia no se hace obligatoria. Si hay selección local, crear recepción exige una decisión explícita: crear sin estos archivos y liberarlos al salir. Cambiar la selección, incluso reemplazar un video conservando el mismo count, invalida esa decisión. Un POST fallido mantiene la selección mientras siga siendo elegible; el backend de creación no recibe campos media ni un nuevo invariant. La navegación manual avisa en el panel de que la selección se libera; no se implementa persistence ni una política de navegación/background nueva.

El cierre existente permanece igual porque no existe carga remota en producción ni evidencia cargada asociada por este ticket. Política de cierre/continuación con uploads activos o ambigüedad: CONTRACT_DEPENDENCY; no se inventa condición backend ni se usa el executor sintético para justificar una regla de producto.

## Pruebas y gates

`reception-media.test.tsx`: 41 pruebas, con el componente de recepción real y su integración en intake; fixtures y executors/adapter totalmente sintéticos. Cubren gates de permisos/aviso/adulto, local foto/video, no saved, F01+F04, PUT vs active, reemplazo y release, malformed completion, A/B fuera de orden, mismos Files/nombres, cancel/restart/recovery, 403/412/413/415/422, revocación/refresh equivalente, cap de dos, video aislado, dispose/unsubscribe/late results, StrictMode, foco, porcentaje no inventado, ausencia de persistencia y cuerpo de create intacto.

| Comando exacto | Resultado final |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, cero warnings |
| `npm test -- src/features/reception/reception-media.test.tsx` | PASS: 41 |
| `npm test -- src/features/reception` | PASS: 221, 7 archivos; incluye las 180 pruebas de recepción existentes |
| `npm test -- src/shared/media` | PASS: 329, 10 archivos |
| `npm test` | PASS: 908, 42 archivos |
| `npm run test:e2e:harness` | PASS: 191, 11 archivos; harness sintético, no E2E del backend |
| `npm run build` | PASS; advertencia de chunk >500 kB, sin cambio de política de splitting |
| `git diff --check` | PASS |
| `git status --short` | Limpio tras el único commit; temporal node_modules retirado |

## Evidencia de navegador

Chromium real headless, Vite local, componente real ReceptionMedia + F01/F04 con adapter/storage sintéticos. Ejecutado con `node /private/tmp/f05-browser.mjs` y entry `/private/tmp/f05-browser-entry.tsx`, fuera del repo. Primera ejecución del harness temporal corrigió su documento de entrada; la aplicación no cambió por ese error. Ejecución final PASS a 320/390/768/1440 px. Cada ancho verificó selección local foto/video, teclado Enter para subir/quitar, indeterminate sin value, PUT → Confirmando sin guardado, active → reemplazo, foco después de quitar video, cero pageerrors y cero overflow horizontal. PNGs local/uploading/confirmed y `results.json` en `/private/tmp/s4-f05-browser/`; inspección visual de 320-local y 1440-uploading realizada.

Los metadatos de video se inyectaron explícitamente para el harness; la preview muestra fallback cuando el binario sintético no se decodifica. No prueba codecs, duración real, getUserMedia, cámara/dispositivo, backend, asociaciones, R2, CORS ni progreso real de bytes. No se ejecutó E2E autenticado contra infraestructura real ni se cambiaron settings de producción.

## CONTRACT_DEPENDENCY pendiente

Create/upload-session y complete de fotos/video (paths/body/DTOs/envelopes); mediaType/retentionClass; MIME/bytes/duración; asociación recepción/daño y sus permisos/estado; list/fetch/download/read; delete/remove; server ordering; reconciliation endpoint/identifier; new-session/idempotencia/retry seguros; R2 CORS; transporte real con progreso de bytes; política de cierre/continuación con media pending/ambiguous.

El resultado revisable es la integración UI local y la orquestación comprobada sintéticamente. La integración remota de producto continúa bloqueada en sus fronteras contractuales. No existe adaptador fabricado ni creación especulativa de orphan media.
