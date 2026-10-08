# S4-F05 — Reception / Damage Media Integration

Fecha: 2026-10-08 (America/Bogota). Repositorio: TallerMecario frontend.

## Base y head

- Base original: `8d5586b183b0df42f0a70bea182b9bf991f47a5d` (main, F04 merge).
- Base del focused fix / commit previo intacto: `aaaa2f165d437ec9087d11d558f5287d43bfdbec`.
- Rama/head: `task/s4-f05-reception-media`, un nuevo commit de fix sobre `aaaa2f1`, sin amend. Este informe describe el estado final corregido. El hash del fix se entrega en el reporte de la tarea; resolver con `git rev-parse HEAD`.
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
| NON-BLOCKING para la foundation sintética (sin captura productiva) | R2/CORS, progreso real de bytes en browser, integración backend y política de cerrar/continuar con media pendiente o ambigua. Sí bloquean sus respectivas funcionalidades remotas. |

DOC_CONFLICT documental: `docs/api/reception-and-media-contract-status.md`, párrafo PENDIENTE DE TRACK A, conserva una instantánea que declara pendiente recepción S3; el adaptador/DTOs/pruebas e informes S3 ya existen. Se conserva la fuente histórica sin reescribir contratos: se reutiliza el código de recepción vigente y se mantiene bloqueado el nuevo HTTP de fotos/video. Impacto frontend: solo UI local y puertos existentes; impacto backend: ninguno. No se extrapolan contratos de firma ni columnas SQL.

## Integración implementable

`NewReceptionPage`, ruta `/recepciones/nueva`, mantiene el panel entre la autorización y el formulario. `ReceptionMediaCapability` expresa explícitamente `unavailable` o `available` con executor requerido. La ruta real usa el default unavailable: no recibe executor sintético ni muestra controles de aviso/adulto/foto/video/carga para media. Muestra solamente: “La carga de evidencia fotográfica y de video todavía no está disponible.” La creación sigue permitida sin evidencia; el consentimiento de servicio del flujo de recepción no cambia.

La foundation interactiva se verifica mediante capability available inyectada explícitamente en tests/harness. Conserva vehículo/propietario validados, consentimiento server-issued granted/service_provision, aviso exacto de ReceptionApi.notice, responsable/canal, adulto no premarcado y advertencias independientes F02/F03. Ningún executor, ID o resultado ficticio entra en la ruta de producción. No hay condicionales NODE_ENV, nuevas rutas HTTP ni fallback de éxito.

El detalle muestra únicamente: “La consulta de evidencia fotográfica y de video todavía no está disponible.” No simula galería vacía, asociación, lectura exitosa ni rechazo de permiso. Se retiró el lenguaje de contratos del producto; recovery usa “No vuelvas a cargar este archivo hasta que se pueda verificar su estado.” Checklist, daños, cierre y firmas históricas conservan sus operaciones; la captura de firma digital no vuelve.

Permisos: `receptions.create` + `media.upload`, ambos scope tenant con `can` compartido. Assigned no prueba acceso al recurso y no habilita esta captura general. No se inventa permiso ni parser RBAC. Los grants de lectura/captura de consentimiento y CRM siguen regidos por el flujo de recepción existente. La normalización compartida se conserva. Refreshes semánticamente equivalentes preservan selección, URLs, adulto, avisos y tasks. La propia frontera de elegibilidad de ReceptionMedia ahora desmonta el estado sensible al perder acceso, incluso si su caller lo mantiene montado y no aborta la señal: no depende únicamente del remount del provider. Revocación real limpia tasks, subscriptions, pendientes y confirmados; resultados tardíos se ignoran.

## Ownership, identidad y lifecycle

- ReceptionMedia es una shell sin estado sensible. ReceptionMediaSession posee aviso/adulto; ReceptionMediaEvidence posee contadores, orden y confirmados, y contiene pickers/tasks. Pérdida de autorización, consentimiento/identidad o capacidad desmonta la sesión; desmarcar adulto desmonta Evidence. Sus cleanups de layout notifican pending=false con el callback actual, sin timers ni inferir truth de counts de hijos liberados. Rechecking adulto empieza vacío y exige nuevamente las advertencias locales.
- F02/F03 conservan los únicos estados de selección con Files y los únicos propietarios de URLs. Se añaden slots de presentación sin duplicar picker, validación, metadatos ni lógica de foco. F05 conserva únicamente contadores/referencias de IDs, orden local y metadata confirmada; no guarda árboles independientes de Files ni base64.
- Cada selección tiene su propio componente/task F04. El File se pasa al executor únicamente al iniciar explícitamente. Handles de cancelación quedan ligados al intento que los originó. F04 libera payload al completar, fallar, cancelar o disponer.
- Máximo dos uploads explícitos simultáneos, compartidos entre fotos/video; Set de permisos locales de ejecución, sin scheduler, queue, Promise.all masivo ni auto-dispatch. Permite aislar cancelaciones/completions fuera de orden con un límite pequeño. La producción actual no expone captura ni upload porque su capacidad es unavailable. El cap de dos se ejercita solo mediante capability disponible sintética.
- Se consume directamente UploadTaskState/UploadRecovery y uploadTaskCopy: local, preparing/uploading/completing, confirmed active, failed, ambiguous, needs_restart, canceled. Progreso indeterminado carece de value; solo eventos reales proporcionan ratio. Live copy por fase no anuncia cada byte.
- PUT 2xx, complete enviado o 100% no significan confirmación. F01 parsea active e identidad; F05 vuelve a validar el resultado antes de mostrar “Carga confirmada”. Active prueba confirmación de carga/almacenamiento, NO asociación a la recepción: se retiró “Guardado” de las filas confirmadas y no se usa “Adjuntado” o “Asociado”. Un resultado malformed queda ambiguous. Confirmación añade metadata remota por mediaAssetId y retira selección local en una actualización batched, sin miniatura duplicada ni preview remoto inventado. Los confirmados conservan orden de selección de esta sesión, sin alegar orden de servidor.
- Solo safe_local_restart habilita Reiniciar carga; user_action pide quitar/cambiar; contract_dependency/reconciliation bloquea replay. Storage 403 no se traduce a RBAC, 412 no permite misma sesión y 413/415/422 conservan preview para decidir cómo cambiarlo. No rollback remoto supuesto al cancelar.
- Cancel A no afecta B; resultados y callbacks tardíos no cambian otro item. Un mismo File o filename seleccionado dos veces conserva IDs distintos. Video está aislado y F03 sigue permitiendo un único video local, reemplazado atómicamente.
- Unmount/remoción, nueva identidad de vehículo/propietario/consentimiento, identidad de usuario o taller y cambio real de permisos limpian selección/URLs, unsubscribe, dispose y abort. Señales abortadas y generaciones F04 impiden resultados del contexto anterior. No hay continuación de upload prometida tras navegar.
- Foco: F02/F03 mantienen remove/reset. Cancel vuelve al restart permitido o a su estado; confirmación enfoca la lista confirmada solo si eliminó el control enfocado, sin robar foco movido por el usuario.

## Continuar / crear / cerrar

La evidencia no se hace obligatoria. En producción, unavailable implica que no se solicita ninguna decisión de descarte de archivos inexistentes. Con capability disponible en tests, una selección local requiere una decisión explícita antes de crear sin esos archivos; cada cambio o desaparición de la selección invalida la decisión. Los cleanups notifican false al desmontar, cambiar identidad, perder permisos/capacidad o desmarcar adulto. Esto elimina el stale localMedia aunque el formulario padre siga montado.

`prepare()` invalida inmediatamente la captura al iniciar la reconsulta de propietario, antes de que llegue su respuesta: limpia pending/discard, consentimiento y validatedOwner, desmonta los propietarios de Files/URLs/tasks e ignora resultados antiguos. Revalidar propietario y consentimiento inicia media limpia. reloadNotice, cambio de vehículo y las ramas de error que invalidan consentimiento/propietario también limpian pending/discard explícitamente.

Un POST fallido preserva Files/previews SOLO si siguen válidos la elegibilidad y el contexto de media. La regresión de INTERNAL_ERROR/500 conserva foto y video. PRIVACY_CONSENT_NOT_ELIGIBLE y VEHICLE_OWNERSHIP_CONFLICT desmontan media y limpian pending/discard al invalidar consentimiento/propietario; PRIVACY_CONSENT_NOT_FOUND comparte la primera rama. Ningún File reaparece al recuperar elegibilidad. El payload de create permanece igual, sin campos media ni nuevos invariants del backend. No se añade persistencia ni una política de background/navegación.

El cierre existente permanece igual porque no existe carga remota en producción ni evidencia cargada asociada por este ticket. Política de cierre/continuación con uploads activos o ambigüedad: CONTRACT_DEPENDENCY; no se inventa condición backend ni se usa el executor sintético para justificar una regla de producto.

## Pruebas y gates

`reception-media.test.tsx`: 57 pruebas (41 existentes adaptadas a capability explícita/copy neutral + 16 regresiones nuevas), con el componente de recepción real y su integración en intake; fixtures y executors/adapter totalmente sintéticos. Cubren gates de permisos/aviso/adulto, local foto/video, no confirmación prematura, F01+F04, PUT vs active, reemplazo y release, malformed completion, A/B fuera de orden, mismos Files/nombres, cancel/restart/recovery, 403/412/413/415/422, revocación/refresh equivalente, cap de dos, video aislado, dispose/unsubscribe/late results, StrictMode, foco, porcentaje no inventado, ausencia de persistencia y cuerpo de create intacto.

| Comando exacto | Resultado final |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, cero warnings |
| `npm test -- src/features/reception/reception-media.test.tsx` | PASS: 57 |
| `npm test -- src/features/reception` | PASS: 237, 7 archivos; incluye las 180 pruebas de recepción existentes |
| `npm test -- src/shared/media` | PASS: 329, 10 archivos |
| `npm test` | PASS: 924, 42 archivos |
| `npm run test:e2e:harness` | PASS: 191, 11 archivos; harness sintético, no E2E del backend |
| `npm run build` | PASS; advertencia de chunk >500 kB, sin cambio de política de splitting |
| `git diff --check` | PASS |
| `git status --short` | Limpio tras el nuevo commit de fix; temporal node_modules retirado |

## Evidencia de navegador

Chromium real headless, Vite local, componente real ReceptionMedia + F01/F04 mediante capability available explícita, adapter/storage sintéticos. Harness temporal `node /private/tmp/f05-browser.mjs`, entry `/private/tmp/f05-browser-entry.tsx`, fuera del repo. Ejecución del fix PASS a 320/390/768/1440 px: local foto/video y teclado, indeterminate sin value, PUT → Confirmando sin confirmación prematura, active → Carga confirmada/reemplazo, foco al quitar video, adulto false → pending=false y limpieza de confirmados/locales, adulto true → selección vacía, capability unavailable → cero controles de captura/aviso/adulto y copy sin lenguaje de desarrollo, cero pageerrors y overflow horizontal.

Artefactos del fix: PNGs local/uploading/confirmed/unavailable y results.json en `/private/tmp/s4-f05-fix-browser/`. Evidencia anterior de captura en `/private/tmp/s4-f05-browser/` corresponde al commit previo; no describe la capacidad actual de producción. Los metadatos de video siguen inyectados explícitamente; la preview usa fallback si el binario sintético no se decodifica. No prueba codecs, duración real, cámara, getUserMedia, backend, asociaciones, R2/CORS ni progreso real de bytes. No se ejecutó E2E autenticado real ni se cambiaron settings de producción.

## Focused fix y revisión del delta

Cuatro hallazgos corregidos: stale pending/discard tras desmontar; captura productiva sin executor; confirmación que sugería asociación; estado sensible conservado en un componente reutilizado tras perder permisos. Las 16 nuevas regresiones cubren adulto false para foto/video y rechecking limpio, desaparición de la decisión del padre, reconsulta de dueño con respuesta deferred, dos rechazos de create que invalidan contexto, error ordinario preservando media, unavailable sin pasos/calls, rutas productivas sin executor sintético y evidencia opcional, pérdida de grants SIN remount/abort del provider con dispose/unsubscribe y resultado tardío, grants equivalentes con URLs/avisos/task preservados, identidad de consentimiento, pérdida de capability, unmount final y copy de carga sin asociación. Las pruebas existentes mantienen non-active nunca confirmado y todos los demás invariants de F01–F04/recepción.

Archivos del fix: `src/features/reception/new-reception-page.tsx`, `reception-detail-page.tsx`, `reception-media.tsx`, `reception-media-upload.tsx`, `reception-media.test.tsx`, y este informe. No se modifican F02/F03, normalización de permisos, HTTP/DTOs, backend o dependencies. Inspección únicamente del delta con `git diff aaaa2f165d437ec9087d11d558f5287d43bfdbec..HEAD`; commit previo intacto, un único nuevo fix, sin push ni PR.

## CONTRACT_DEPENDENCY pendiente

Create/upload-session y complete de fotos/video (paths/body/DTOs/envelopes); mediaType/retentionClass; MIME/bytes/duración; asociación recepción/daño y sus permisos/estado; list/fetch/download/read; delete/remove; server ordering; reconciliation endpoint/identifier; new-session/idempotencia/retry seguros; R2 CORS; transporte real con progreso de bytes; política de cierre/continuación con media pending/ambiguous.

El resultado revisable es la disponibilidad productiva honesta y la foundation de orquestación con lifecycle endurecido comprobada sintéticamente. La captura/carga interactiva no se expone a usuarios hasta contar con la capacidad real. La integración remota de producto continúa bloqueada en sus fronteras contractuales. No existe adaptador fabricado ni creación especulativa de orphan media.
