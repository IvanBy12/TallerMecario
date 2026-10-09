# S4-F07 — Final Media Gate / E2E Readiness Audit (R0)

Fecha: **2026-10-08, America/Bogota**. Responsable: Codex, auditoría frontend en modo lectura; única modificación autorizada: este informe. **S4-F07 READINESS: BLOCKED**. No se declara Sprint 4 PASSED.

## Revisión y alcance de evidencia

- Base frontend/main y rama auditada: `f4a6537ba8a470e72e412368c956b728a63b2c0c` (merge F06, PR #19).
- Rama de entrega: `task/s4-f07-media-final-gate`; worktree existente, limpio antes de la auditoría: `/Users/ivanby/Documents/Proyectos/TallerMecario-worktrees/s4-f07-media-final-gate`. Head final: el commit documental que contiene este informe; consultar `git rev-parse HEAD`.
- Las verificaciones se ejecutaron en `/Users/ivanby/Documents/Proyectos/TallerMecario`, `main`, con dependencias existentes. Ambos checkouts tenían el mismo HEAD y ningún cambio de código; el worktree documental carecía de node_modules. Node **v22.23.3**, npm **10.9.9**, conforme `.nvmrc` 22 y engines `>=22.22.2 <23`.
- Backend inspeccionado **solo en lectura**: `/Users/ivanby/Documents/Proyectos/TallerMecarioB`, main limpio, `ec14ba7eb81e65d08f099f0466a1eb99688478e7` (merge B04 Phase A, PR #13). No se ejecutaron sus pruebas, migraciones, consultas PostgreSQL ni comandos R2. Las evidencias históricas backend se identifican como tales; no acreditan despliegue actual.
- No implementación, dependencias, executor simulado de producción, cambio backend, persistencia local nueva, proxy, push ni PR. No se ejecutó E2E remoto.

### Archivos y fuentes auditados

Frontend, rutas relativas a la raíz del repositorio:

- `AGENTS.md`, todos los módulos aplicables `docs/agents/`, `.nvmrc`, `package.json`, `playwright.config.ts`, `.github/workflows/e2e-mobile.yml`, `.env.e2e.example`, `README.md`.
- `src/app/app-routes.tsx`; `src/shared/media/{media-types,media-contract,media-client,media-upload,media-errors,upload-task,upload-task-types,upload-task-execution,upload-task-copy}.ts`, sus pruebas; pickers, selección, validación, metadatos y previews en `src/shared/media/photo/` y `video/`.
- `src/features/reception/{new-reception-page,reception-context,reception-media,reception-media-upload,reception-detail-page,reception-workflow}.tsx`; `reception-api.ts`, `reception-contract.ts`, `use-reception-action.ts`; pruebas de API, contrato, páginas, workflow y media.
- `src/shared/storage/{storage-capabilities,storage-quota,storage-types}.ts` y pruebas; `src/test/media-fixtures.ts`.
- `e2e/{auth.setup,s3-happy-path.spec,s3-rbac.spec,s3-cross-tenant.spec,desktop-smoke.spec}.ts`; `e2e/support/{env,artifact-policy,network-evidence,reception-flow,clerk-login,secret-input,api-probe}.ts`; suite `e2e-harness-tests/`, especialmente `unit/synthetic-browser.test.ts`.
- `docs/api/reception-and-media-contract-status.md`, `docs/architecture/{media,frontend-boundary,authentication-and-workshop,pwa-offline}.md`, ADR-003/005, `docs/domain/roles-and-permissions.md`, diccionarios 02/04/05 (secciones pertinentes), privacidad, alcance MVP, `docs/OPEN-QUESTIONS.md` FE-DOC-04/05/06/07/08/13/14, decisión sin firma del 2026-10-05, gates y evidencias S3/F01–F06.

Backend, referencias fijadas al commit auditado:

- [B01: contrato media][B01], [B02: integridad][B02], [B03: idempotencia][B03], [B04: binding operacional Phase A][B04], [contrato de recepción][BR].
- [rutas media][B-ROUTES], [servicio media][B-SERVICE], [binding operacional][B-BINDING], [firmador/transporte R2][B-R2], [tests de binding][B-TEST], [fixtures reales sintéticos][B-FIXTURES], [gate R2 Node][B-R2-TEST], `.github/workflows/r2-external.yml`.

La disponibilidad READY de una primitiva en esta auditoría significa contrato/código existente, **no** prueba de disponibilidad desplegada o gate ejecutado hoy.

## Capacidad productiva frontend y F01–F06

La composición exacta es `src/app/app-routes.tsx:50`: `<NewReceptionPage />` sin capability. `src/features/reception/new-reception-page.tsx:13` aplica por defecto `{ kind: 'unavailable' }`. El union `ReceptionMediaCapability` está en `reception-media.tsx:12`; su rama unavailable muestra indisponibilidad sin pickers ni PUT. Ningún composition point de producción aporta `{ kind: 'available', executor: ... }` para fotos/video. El único adaptador HTTP media específico en `reception-api.ts` es legado de **firma**, que no habilita media operacional y no se presenta en el workflow activo.

| Historia | Hecho comprobado en código actual | Límite |
| --- | --- | --- |
| F01 | Cliente genérico create → PUT → complete; valida DTO e identidad; solo active confirma carga | `MediaApiAdapter<Input>` deja request/path de cada dominio al adaptador; falta adaptador operacional |
| F02 | Fotos locales, Files originales, selección/previews/remoción | Política opcional; integración recepción no suministra allowlist/límite backend |
| F03 | Un video local de recorrido, metadatos/duración, reemplazo seguro | No stitching; no garantía de contenido 360° ni duración máxima canónica |
| F04 | Task/progreso/cancel/dispose/estados ambiguous/recovery; sin retry automático | 403 requiere nueva sesión; 412 y complete ambiguo requieren reconciliación contractual |
| F05 | Consent/owner/RBAC, lifecycle local y seam sintético; cap compartido **2 uploads explícitos** | Producción unavailable; no asociación ni lectura remota; active se muestra como carga confirmada, no adjuntado |
| F06 | estimate/persisted/persist y evaluación de política de cuota explícita | Foundation; ninguna File/Blob queue, persistencia ni gate Sprint 13 |

`parseUploadSession` exige pending/PUT/IDs/objectKey/expiresAt y descarta objectKey. `putMedia` usa URL HTTPS y headers emitidos, `credentials: omit`, `redirect: error`, Blob sin MIME implícito, no token Clerk y no lectura de cuerpos storage. `parseActiveMedia` rechaza pending/uploaded/quarantined/deleted y exige tamaño positivo/checksum válido o null; cliente comprueba identidad de asset. PUT 2xx/progreso 100%/complete enviado **no** equivalen a saved. `expiresAt` no es un bloqueo basado en reloj local: R2 valida URL, backend valida sesión.

## Estado contractual backend y discrepancias documentales

El contrato esperado del ticket **existe para la primitiva upload** en B02–B04 y runtime actual:

1. `POST /api/v1/media/upload-sessions`, body estricto con `mediaType`, `mimeType`, `retentionClass`, `idempotencyKey` UUID, **expectedSizeBytes obligatorio**, `capturedAt?` y, para photo/video/video360, `operationalContext: { type: 'reception', receptionId }` o `{ type: 'damage', damageId }`. Clase operacional; no tenant/customer/order/consent/purpose suministrado como autoridad. Daño admite photo/video, **no video360**.
2. `201 { uploadSessionId, mediaAssetId, status: 'pending', uploadUrl, uploadMethod: 'PUT', uploadHeaders, objectKey, expiresAt }`. MIME firmado exacto y `If-None-Match: *`; sesión inicial 900 s, URL `min(900, floor(lifetime restante))`, expiry inmutable en replay.
3. `POST /api/v1/media/upload-sessions/:id/complete`, **id de sesión**, body opcional con `checksumSha256?`; `200 { mediaAssetId, status: 'active', sizeBytes, checksumSha256 }`. Compara tamaño exacto persistido, MIME/estructura y versión observada; errores deterministas cuarentenan, storage técnico indisponible queda pendiente. Checksum es **declarado/no verificado**, no ETag ni hash probado de bytes.
4. B03 permite replay equivalente de create pendiente con misma key/payload/contexto y renovación limitada; mismatch/expired/failed/completed conservan errores específicos. Complete equivalente devuelve éxito persistido sin duplicar efectos. Esto habilita diseñar reconciliación por complete; no existe aquí contrato de consulta genérica de sesión ni autorización para repetir PUT a ciegas.
5. B04 verifica target tenant/open, consentimiento inicial exacto elegible y RBAC, y persiste evidencia de binding. Revocación **posterior** no invalida replay/complete de esa misma operación inicialmente autorizada; una **nueva** operación sí exige consentimiento vigente. Cierre del parent bloquea replay/complete. El frontend no debe convertir la revocación posterior en un requisito backend inexistente.

**B04 sigue abierto:** `PURPOSE_CATALOG_UNRESOLVED`, sin attach público reception_media/damage_media, INSERT de enlaces, gallery, reorder ni quantity limit. Binding protege una operación en curso; **no es asociación final**, autoridad de download ni inicio del reloj operativo de retención. `service_provision` es propósito de consentimiento y **no** un purpose inventado para media.

| DOC_CONFLICT / fuentes y sección | Contrato actual frente a evidencia contradictoria | Resolución propuesta / impacto |
| --- | --- | --- |
| FE snapshot `docs/api/reception-and-media-contract-status.md`, PENDIENTE; F01/F05 inventario de contratos | Dice pendientes recepción/media y F05 no tenía operacional aprobado. Backend BR, B02/B03/B04 + routes ahora contienen recepción y upload operacional | Conservar snapshots históricos; sincronizar una referencia backend fijada a revisión, sin reescribir fuentes. FE puede reconciliar adaptadores upload; asociación permanece bloqueada. Backend sin cambio de request por este informe |
| B01 §§3/5 y B02/B03 remaining scope, frente a B04 + runtime | B01 describía tamaño opcional/gaps runtime; B02/B03 dicen operacional bloqueado por B04. Runtime exige tamaño y contexto desde B04 | Aplicar B02/B03/B04 en orden, anotando actualización de estado documental por dueño backend. FE usa body estricto actual, nunca firma como sustituto. No nuevo DTO |
| B01 §9 vs `service.ts:getMediaDownloadUrl` | Contrato bloquea deletion_requested_at/deleted_at/purged_at y coordina delete; runtime consulta status/deleted_at, sin check explícito de los otros marcadores/serialización ni assigned | B06/B07 deben cerrar runtime/evidencia; D9 queda bloqueado para garantía completa. FE no crea acceso alterno; backend owns lifecycle/authorization |
| Gates S3/fuentes antiguas de firma vs decisión 2026-10-05 | Snapshots piden captura; decisión actual retira captura y mantiene históricos | Conflicto ya resuelto explícitamente por usuario; F07 regresión no resucita captura. Ninguna edición backend/frontend funcional |

## D1–D12

| ID | Dependencia | Estado | Fuente exacta y alcance / mínimo pendiente |
| --- | --- | --- | --- |
| D1 | Sesión operacional con recepción | **READY** | B04 “Wire and initial authorization”; routes.ts:24–80; operational-binding.ts:29. Body aprobado y runtime existen; despliegue no demostrado |
| D2 | Sesión operacional con daño | **READY** | Mismas fuentes; damageId resuelve parent; photo/video solamente. No habilita attach |
| D3 | complete → active | **READY** | B02 “Implementation and guarantees”; B03 “Completion”; routes.ts:89; service.ts completion. DTO activo existente, integridad acotada y checksum no verificado; duración pendiente |
| D4 | PUT R2 real usable en browser | **BLOCKED** | B03 “Final evidence” acredita **Node** real 6/6 histórico; tests/media/upload-flow.test.cjs usa fetch Node. F01 transport existe, pero no prueba browser productivo, operacional o CORS |
| D5 | CORS PUT desde origen FE | **BLOCKED** | No policy bucket ni prueba OPTIONS/PUT con Origin en FE workflow/config ni backend docs/scripts/media tests/r2-external workflow inspeccionados. API CORS no demuestra bucket CORS |
| D6 | Asociación final recepción | **BLOCKED** | B04 “Boundaries and remaining blocker”; B01 §§4/8. Falta catálogo purpose, método/path/body/response, errores y asociación atómica con retención |
| D7 | Asociación final daño | **BLOCKED** | Mismas fuentes; binding damage no escribe damage_media. Daños forman parte del alcance de enlaces Sprint 4; no se descartan por conveniencia |
| D8 | List/query recepción/orden | **BLOCKED** | B04 no gallery; B01 §8 define orden previsto pero no publica ruta/DTO. BR §5.4 detalle tiene checklist/damages/signature/serviceOrder, sin galería operacional |
| D9 | Signed read/download autorizado | **BLOCKED** | Ruta real GET /api/v1/media/:id/download-url, routes.ts:124, service.ts:458–472; 200 {mediaAssetId,downloadUrl,expiresAt}, 300 s. Tenant/read/active/deleted_at existen; faltan garantías B01 §9/B06/B07 y read/view vinculado a dominio |
| D10 | Catalogue de purpose | **BLOCKED** | B04 “PURPOSE_CATALOG_UNRESOLVED”; B01 §4. Exigir strings/combinaciones canónicos, no usar descripciones, consentimiento ni fixtures |
| D11 | RBAC media.upload/read completo | **BLOCKED** | B01 §12, B04 boundaries, routes.ts:28–31. Tenant-wide owner/admin/advisor definido; técnico assigned fail-closed, B07 pendiente. La denegación segura actual es estable, no implementación completa de assigned |
| D12 | E2E real Clerk/backend/PG/R2 | **BLOCKED** | playwright.config.ts, env.ts CORE/RESTRICTED/TENANT_B, .env.e2e.example/workflow. Faltan variables locales y provisioning/deployment/CORS/fixtures de media verificados; specs actuales solo S3 |

Ninguna D1–D12 se clasifica NOT REQUIRED FOR FRONTEND F07: todas afectan el gate solicitado. Subcapacidades futuras (diagnóstico/delivery media, reorder, límite de cantidad inventado, offline S13) quedan fuera. READY parcial de upload no neutraliza los bloqueos de dominio/entorno.

## Mapeo del gate canónico Sprint 4

Fuente: `docs/quality/frontend-relevant-gates.md` §7, coincidente con `docs/product/mvp-and-sprint-scope.md` §7 y ADR-003. Estado aquí: readiness, **no PASS**.

| Criterio canónico | Evidencia presente / dependencia que impide cierre |
| --- | --- |
| retention metadata/lifecycle | Diccionario 04 y B01 §§2/10/11; metadata existe, no acredita motor aplicado. Backend B05/B06 pendiente |
| Incompletos expiran/purgan 24 h | Expiry lógica 900 s B03; cleanup física baseline 24 h es distinta y B05/B06 pendiente |
| Operacional 12 meses post-orden; warranty +90 días; evidencia 36 meses | B01 §10, arquitectura media; clocks/retention engine B05 pendiente; no derivar TTL de upload o close de recepción |
| Legal hold; deleted bloquea URL antes de purge; worker audit y protección vínculos | B05/B06 pendientes; download runtime gap indicado; FE tests no prueban holds/purge |
| Scan objetos faltantes/huérfanos | B08 pendiente según B01 §15 y B04 boundaries; no evidencia nueva |
| Sesión/URL temporal/video directo/fotos | D1/D2/D3 primitiva presente, pickers/transport F01–F03; D4/D5 y executor productivo bloqueados |
| Retry/interrupción/archivo inválido | F04 regresión y B02/B03 primitiva; falta recovery productivo y ejecución real. Duración sigue DURATION_POLICY_UNRESOLVED |
| Metadata persistida/checksum/tamaño | B02/B03 implementación/evidencia histórica: tamaño esperado/real/MIME y declaración SHA; no checksum verificado ni prueba actual desplegada |
| Enlaces específicos/no polymorphic write/Media A no enlaza Entity B | B04 binding tenant-safe no sustituye enlace final; D6/D7/D10 bloquean HTTP/test attach. No write polimórfico inventado |
| URL download expira | TTL 300 s contrato/código existente; D9/D12 requieren prueba real de expiry/read lifecycle y RBAC |
| R2 caído no destruye recepción | Contratos separan create y media; flujo FE posterior al POST no existe; falta prueba real y UX parcial |
| Consulta/vista por orden | D8/D9 bloqueados, tampoco frontend gallery |
| E2E recepción + video + fotos | D4–D12 relevantes, orquestación y fixtures/specs F07 pendientes; harness no satisface este criterio |

Estos requisitos backend siguen siendo dependencias del gate Sprint 4, aunque no sean implementación frontend. No se evalúan como aprobados mediante jsdom/harness.

## R2 / CORS

No evidencia versionada inspeccionada demuestra policy R2 aplicada al origen de prueba/staging. B02/B03 registran gate externo Node real con PUT condicional/HEAD/Range/GET, sin enforcement browser CORS. B04 tests de binding no certifican navegador real. No se consultó la cuenta Cloudflare ni se cambió configuración.

Infra debe aportar bucket privado, origen(s) **exactos** aprobados, policy/version aplicada y prueba browser desde esos orígenes: preflight OPTIONS permite PUT, headers `Content-Type` exacto, `If-None-Match` y demás headers realmente emitidos/firmados; respuesta PUT accesible por CORS; GET/view y Range si el consumidor los requiere. OPTIONS es el intercambio preflight, no una suposición sobre cómo el proveedor enumera AllowedMethods. No cookies/Clerk hacia R2, sin wildcard credentials. Acreditar URL vencida rechazada y segundo PUT 412, además de prueba negativa de origen no aprobado. No proxy API para evadir CORS.

Los TTL de URL/sesión/descarga son normativos y existentes; su expiración real desde browser no se ejecutó aquí. D4/D5 permanecen BLOCKED incluso con gate Node histórico exitoso.

## E2E real, fixtures y evidencia segura

`playwright.config.ts` dice Sprint 3; mobile `testMatch` solo `s3-*.spec.ts`, un worker, retries 0; setup real y smoke desktop. `s3-happy-path.spec.ts:49–52,100` exige **cero** requests signature/media. Workflow manual `workflow_dispatch`, Environment `e2e-mobile`, sin push/PR trigger, con vars y secrets nombrados abajo. No spec F07, ni fixture photo/video consumido por e2e ni setInputFiles de media operacional. `e2e:list` enumera 10 pruebas de 5 archivos; no acredita ejecución real.

- Públicas/requeridas: `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY` test, `E2E_TENANT_ID`, `E2E_TENANT_B_ID`, `E2E_TENANT_B_RECEPTION_ID`.
- Secretas/requeridas: `E2E_USER_EMAIL/PASSWORD`, `E2E_RESTRICTED_EMAIL/PASSWORD`, `E2E_TENANT_B_USER_EMAIL/PASSWORD`. Personas distintas, memberships previstas y tenants diferentes; actor restricted actual es técnico, no fixture probado de tenant actor con media.upload retirado.
- Opcionales: `E2E_BASE_URL` (sin valor arranca dev local), `E2E_VERIFICATION_CODE`, `E2E_TENANT_B_SENTINEL`. `E2E_VEHICLE_PLATE` retirada; placas se generan por corrida. El workflow no aporta E2E_BASE_URL y usa frontend dev por defecto.
- Comprobación local **solo presencia, sin imprimir valores**: `.env` existe, API/key presentes y key comienza pk_test_; `.env.e2e` ausente. Faltan todas las variables E2E requeridas anteriores. Ausencia de E2E_BASE_URL no bloquea por sí sola. Secrets/vars remotos de GitHub no fueron verificados; una declaración en YAML no prueba provisioning.
- Falta acreditar entorno real con backend ec14ba7 o sucesor autorizado y migraciones (incluido binding 0026), Clerk test, PostgreSQL, R2 privado/CORS, roles/consent/target y limpieza segura de datos/objetos. El éxito histórico S3 no prueba despliegue media actual.
- `src/test/media-fixtures.ts` contiene URLs/DTOs sintéticos y algunas pruebas Files de bytes de texto: no assets válidos para inspección B02 real. Backend `tests/media/fixtures/README.md` documenta PNG/JPEG/WebP y MP4/MOV H.264 diminutos genuinos, sin PII; candidatos verificables a copiar bajo ticket aprobado, sin dependencia runtime frontend→backend. Su nota operacional bloqueada por B04 es histórica; no prueba public browser path. Fixtures reales de prueba no prueban que un video represente un recorrido 360°.

Trace/screenshot/video siguen **off** por ARTIFACT_POLICY. Auth states `e2e/.auth/`, HTML/reportes autenticados y PII no se publican. Workflow actual conserva un summary collector **legado de firma**; network-evidence.ts correlaciona attach `/signature`, por lo que no demuestra links de foto/video. No reutilizar su aserción de firma como gate operacional ni reactivar captura.

Diseñar collector F07 con aliases por corrida, orden de etapas, método, plantilla de ruta/UUIDs enmascarados, status y booleanos de identidad/binding/active/attach/read. R2 solo se serializa como etiqueta genérica, nunca origen/ruta/key/query/URL firmada, headers, cuerpo arbitrario, token, cookie, filename o customer data. Correlación exacta solo en memoria y se libera al terminar. Para fallos registrar código seguro/etapa/request correlacionado revisado y resultado, no mensajes provider. Revalidar scanner de secretos con control positivo antes de publicar evidencia. Summary permite commit/run/casos/resultados sanitizados, sin estados de sesión ni reportes crudos.

## Secuencia de ingreso legítima y brecha actual

Las fuentes de privacidad permiten captura opcional tras aviso, propietario y consentimiento; BR §§3–5 define create sin media fields y B04 exige parent existente/open para emitir PUT. La secuencia siguiente es una inferencia de compatibilidad entre esos contratos, no una política UX de navegación/cierre ya aprobada. Por tanto los pasos **1–6** siguientes son compatibles con contratos actuales para actores tenant-wide; **7–8** dependen de contrato de asociación/read aún ausente:

1. Contexto backend válido y permisos; propietario principal vigente, aviso mostrado, consentimiento service_provision otorgado y declaración adulta. Opcionales separados; no firma digital.
2. Seleccionar Files locales después del gate de privacidad; aplicar allowlist/límites técnicos canónicos y metadatos UX. Sin persistencia ni upload anterior a receptionId.
3. Un POST reception con body actual, sin media fields. Si falla, conservar solo estado cuyo contexto/elegibilidad siga válido; owner/consent invalidados limpian media. Respuesta ambigua se reconcilia explícitamente conforme BR §6; no se mezcla recovery media con create.
4. Guardar receptionId confirmado y mantener **en memoria** dueño de Files/tasks bajo misma identidad/tenant durante la fase posterior; no navegar/desmontar ese dueño antes de resolver o abandonar explícitamente la carga.
5. Crear sesión por File con idempotencyKey estable para la misma operación, tamaño/MIME exactos y operationalContext.receptionId; daño requiere damageId ya confirmado y solo photo/video. Backend revalida consentimiento inicial, open y RBAC. Concurrencia máxima existente 2; no cola offline.
6. Browser PUT directo y complete por sessionId; solo active con identidad correcta confirma **carga**, no asociación. Resolver replay/ambiguity con contrato B03; 412 no significa éxito ni autoriza segundo PUT.
7. Asociar y leer **solo cuando** B04 Phase B/public contract + D9 existan; purpose/path nunca se inventan. Si asociación falla, estado “recepción creada, carga confirmada, asociación pendiente”, no “guardado/adjuntado”.
8. Mostrar estado parcial verdadero y ofrecer continuar a la recepción ya creada mediante decisión explícita; navegar tras terminar/liberar Files o descartar conscientes de que no habrá recovery tras reload. Upload no hace rollback/cancel/delete de recepción ni repite su POST. No bloquear recepción sin evidencia opcional.

Hoy NewReceptionPage solo guarda un booleano pending, Files pertenecen a pickers hijos; exige descartar locales para create con capability sintética. Create success navega inmediatamente. Unmount aborta/tasks y libera previews/Files; `UploadExecutor<undefined>` ni siquiera recibe receptionId en el seam actual. No hay handoff, upload posterior al POST ni estado parcial recepción+media. Estas son **brechas de implementación**, no una secuencia existente certificada. El lifetime de selección actual no basta para post-create.

No introducir IndexedDB/localStorage/CacheStorage File/Blob persistence, service worker queue, Background Sync ni replay automático. F06 no exige persist() al seleccionar ni implementa cuota offline. Sprint 13 conserva esos contratos. Cancelación/context switch debe abortar y descartar respuestas tardías, conservando la recepción server-side creada y sin relabel de operaciones a otro tenant.

## Matriz F07 a implementar después de desbloquear

Sin implementarla en R0. `REAL` implica browser/Clerk/backend/PG/R2 verdaderos, sin interceptar tráfico para aprobar happy path. `CONTROLADO` es regresión de fallo de transporte con servicios de prueba/inyector autorizado, reportado separado; no se atribuye outage real a un mock. `BACKEND` exige su propia evidencia, no acceso PostgreSQL desde frontend.

| ID / capa | Preparación / acción | Aserción exacta y dependencia |
| --- | --- | --- |
| H01 REAL | Consent válido; una PNG/JPEG real; create reception → sesión reception → PUT → complete | Un receptionId; PUT del target emitido; complete mismo session/asset, active y tamaño exacto; enlace final y reload/read solo con D6/D8/D9 |
| H02 REAL | Un MP4/MOV real, mediaType video360, sin stitching | Mismo pipeline, clase operacional; view autorizado posterior; no afirmar validador 360 ni duración máxima sin canon |
| H03 REAL + regresión | Varias fotos + un video; iniciar más de dos intentos; completar fuera de orden | Máximo 2 en vuelo; control de tercero; cancel A no afecta B; identidad por File/asset, no filename; enlaces listados exactamente una vez |
| H04 REAL | GET gallery y download-url por actor autorizado tras nueva visita | DTO canónico, solo activos accesibles, URL temporal y lectura real; no URL como identificador persistente; D8/D9 |
| N01 REAL/BACKEND | Persona sin media.upload; grants retirados durante create/complete | UI oculta/deshabilita; API rechaza con permiso vigente y cero nuevo éxito; tenant/membership revalidado; fixture específico requerido |
| N02 REAL/BACKEND | MIME fuera de allowlist; cero bytes; tamaño máximo+1; MIME declarado distinto de bytes | UX rechaza donde política configurada; API 400/422 contractual, mismatch/content invalid cuarentena cuando aplica; nunca active; no subir 750 MiB inútiles para validar preflight |
| N03 REAL | Esperar expiry URL/sesión real; renovar pendiente dentro de lifetime; sesión ya expirada | Expiry real rechazada, session no se extiende; nuevo key solo para nueva operación explícita; error seguro; no bloqueo inferido por reloj frontend |
| N04 REAL + CONTROLADO | Firma inválida/URL vencida produce PUT 403; segundo PUT write-once produce 412 | 403 no se traduce a RBAC; 412 no confirma; UI needs_restart/reconciliation; cero “guardado” y ninguna repetición ciega |
| N05 CONTROLADO | Cortar red/abort durante PUT o cancel/dispose | Estado interrupted/ambiguous según dispatch, Files locales si contexto válido; señal abort, resultado tardío ignorado; no replay automático ni persistencia |
| N06 CONTROLADO + REAL replay | Perder respuesta complete tras commit / antes de commit | Estado ambiguous; reintento equivalente complete B03 recupera mismo resultado o error seguro, sin nueva recepción/asset/audit; no remarcar éxito previo a active |
| N07 regresión/BACKEND | DTO pending/uploaded/quarantined/deleted, wrong ID, size/checksum malformed | Parser/task/UI nunca muestra saved; complete active correcto es único confirmed. Checksum null/declarado no se presenta verificado |
| N08 CONTROLADO + REAL/BACKEND | R2 indisponible/falla PUT/503 inspección después de reception POST | GET confirma recepción intacta y mismo id; formulario muestra éxito parcial; cero replay create y sin rollback/cancel receptor |
| N09 REAL/BACKEND + regresión | Consent revocado antes create/nueva sesión; owner cambia antes reception POST; invalidar adult/owner local | Error exacto y limpieza de estado inválido. Revocación posterior a binding permite **misma** operación conforme B04; nueva operación denegada |
| N10 REAL/BACKEND + regresión | Cambiar permisos, tenant, identidad o cerrar recepción durante upload | Aborta/limpia sesión local; respuestas tardías no pueblan nuevo contexto. Backend cierre bloquea replay/complete y phase C revalida permisos; recepción creada persiste |
| N11 regresión + evidencia REAL | Errors/logs/DOM visible/attachments contienen marcadores de token/key/URL/signed query | Scanner no encuentra marcadores sensibles; control positivo sí los detecta; traces/screenshots/video off; no filename/PII innecesarios; una URL GET transitoria necesaria para img/video no se registra ni se presenta como texto |
| X01 REAL/BACKEND | Actor A intenta target/media/enlace/read de tenant B y un id inexistente | Respuestas no enumerables, ninguna URL/link/write; cambio de id no concede autoridad; D6/D7/D9 necesarias |
| X02 REAL/BACKEND | Media ligada a recepción A intenta recepción B del mismo tenant / daño de parent ajeno | Binding no retarget; mismatch/conflito contractual, cero enlace cruzado; propósito/type/retention y estado parent validados; attach exact codes pendientes D6/D7 |
| X03 REAL/BACKEND | Technician assigned/no assignment/released assignment | Backend resource-level upload/read/download según B07; no autorización por id/flag cliente; hoy denegación fail-closed, no caso positivo inventado |
| R01 regresión | Auth/context, customers/vehicles, consentimiento/reception/checklist/damage/close | Suites actuales y S3 real conservan alcance; una orden/close idempotente, conflictos preservan inputs; nuevo spec S4 separado del S3 zero-media |
| R02 regresión | F01–F06, cancel/unmount/preview/cap/quota foundation | Sin queue/persistencia/recovery reload nuevos; historical signatures visibles; ninguna captura de firma resucitada |
| B01 BACKEND | Clocks retención/holds/cleanup/purge/reconciliation/races | Evidencia B05/B06/B08 y duración aprobada requerida; ninguna prueba frontend sustituye constraints/RLS/worker/holds |

Para expiry usar tiempos contractuales/control del entorno aprobado, sin manipular reloj como prueba de R2. Para daños crear/confirmar mediante inspección vigente antes de contexto damage. Para cross-tenant no se insertan relaciones directamente ni se conceden permisos artificiosos al browser. Este diseño no inventa paths/strings de attach/query ni errores aún no publicados.

## Bloqueadores por dueño y mínimo para desbloquear

| Dueño / ID | Bloqueador exacto | Cambio/evidencia mínimo |
| --- | --- | --- |
| DOCUMENTATION / DOC1 | PURPOSE_CATALOG_UNRESOLVED, B04 Phase B no puede publicarse | Dueño producto/backend entrega catálogo canónico de strings/combinaciones para reception_media/damage_media; no usar fixtures. Revisar B01/B04 y sincronizar referencia FE fijada a commit |
| BACKEND / BE1 | No attach/link final ni list/query por recepción/daño/orden (D6/D7/D8) | Contrato HTTP completo aprobado e implementado (método/path, DTOs, envelopes, propósito, scopes, guards, replay/OCC, errores, orden) + pruebas de asociación/tenant/Media A→Entity B y commit; enlace/retención/audit atómicos |
| BACKEND / BE2 | Download lifecycle/resource guarantees y technician assigned pendientes (D9/D11) | B06/B07: deletion markers y coordinación emisión/delete, recurso/assignment y anti-oráculo comprobados; explicitar autorización de galería/download y mantener técnico fail-closed hasta entonces |
| BACKEND / BE3 | Gate global retención/holds/cleanup/purge/scan no acreditado | B05/B06/B08 con clocks/policies/hold y protección binding, worker audit, purge 24 h y reconciliación, evidencia real backend/staging. No exigencia de implementar estos motores en frontend |
| DOCUMENTATION + BACKEND / DOC2 | DURATION_POLICY_UNRESOLVED (B01 §5; B02 pending gates) | Valor/unidad por video/video360 y método confiable aprobados, enforcement y prueba; no inventar duración ni alegar checksum verificado |
| INFRA/R2 / INF1 | No browser CORS demostrado (D4/D5) | Policy privada aplicada al origen exacto + prueba browser OPTIONS/PUT/headers/GET según consumidor, expiry/412 y origen negativo; evidencia sanitizada |
| FRONTEND / FE1 | Unavailable; no adapter/executor operacional, políticas o post-create orchestration | Tras contratos anteriores, wiring real con receptionId, retener Files en memoria tras POST, cap 2, active/recovery/partial state y navegación explícita; no rollback ni create replay por media |
| FRONTEND / FE2 | No domain gallery/read ni recovery integrado | Consumir solo D6/D7/D8/D9 aprobados; diferenciar uploaded/attached/readable; reconcile complete con B03, sin inventar session-query ni PUT retry; aislamiento/lifecycle |
| TEST ENVIRONMENT / ENV1 | Credenciales/tenants/roles/targets/deploy no disponibles/verificados (D12) | Provisionar Environment e2e-mobile y variables obligatorias, backend/migraciones current, Clerk test, PG/R2, personas/fixtures y limpieza; no valores en informe ni frontend bundle |
| TEST ENVIRONMENT + FRONTEND / ENV2 | E2E solo S3 y fixtures/collector legado firma | Fixtures binarios sintéticos realmente decodificables/aceptados; specs S4 seleccionados por config/workflow, collector operacional sanitizado y control positivo; ejecutar matriz real y reportar negativos controlados por separado |

No se propone implementación F07 ficticia ni plan de commits READY. Trabajo frontend independiente admisible: reconciliar/documentar contrato upload fijado y diseñar evidence/fixtures; **no** activar producción solo porque exista B04 Phase A. El siguiente ticket ejecutable recomendado es **resolver el catálogo canónico de purpose y especificar B04 Phase B (associations + read)**, dueño producto/documentación/backend; después cerrar BE1/BE2 e INF1/ENV1 antes de ejecución integral F07. Los motores/gates backend pendientes deben cerrarse para una decisión global Sprint 4.

## Baseline ejecutado

Todos los comandos pedidos se ejecutaron, sin instalar ni cambiar dependencias. Logs temporales externos: `/private/tmp/s4-f07-readiness/` (no artefactos con credenciales reales). Los contadores actuales superan F06 porque main incluye el fix de prueba de timing de recepción.

| Comando exacto | Resultado de esta auditoría |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, cero warnings |
| `npm test -- src/shared/media` | PASS, 329/329, 10 archivos |
| `npm test -- src/features/reception` | PASS, 238/238, 7 archivos |
| `npm test -- src/shared/storage` | PASS, 73/73, 2 archivos |
| `npm test` | PASS, 998/998, 44 archivos |
| `npm run test:e2e:harness` | Primera ejecución sandbox: FAIL, 188/191, 3 fallos derivados de `listen EPERM 127.0.0.1`. Repetición autorizada fuera del sandbox: **PASS 191/191**, 11 archivos, exit 0; no cambio código |
| `npm run build` | PASS, exit 0; advertencia existente chunk >500 kB, JS 572.08 kB / gzip 165.91 kB |
| `npm run e2e:list` | PASS, exit 0; 10 tests, 5 archivos, solo setup/S3/desktop; no ejecución E2E |
| `git diff --check` | PASS en base/main; repetido en worktree documental y diff staged antes de commit |
| `git status --short` | Base/main limpio; worktree limpio antes, solo este informe antes de commit; verificación post-commit limpia |

El primer intento de lint no arrancó porque la creación paralela del directorio temporal todavía no había terminado; se repitió tras crearlo y PASS. No fue error de lint ni se ocultó un fallo de producto. El harness fuera del sandbox usa únicamente su servidor local y marcadores sintéticos: no Clerk/backend/R2 reales. El auto-review permitió esa ejecución; no hubo rechazo de aprobación.

E2E remoto **NOT RUN** por ENV1/INF1/FE1/BE1 y falta de configuración legítima; backend gates **NOT RUN en esta auditoría**, historial leído únicamente. Build/units/harness no cambian readiness a READY ni certifican retención/RLS/staging/R2 de navegador.

## Entrega y decisión

Único archivo cambiado: `docs/quality/s4-f07-media-final-readiness.md`; commit documental `docs(quality): audit Sprint 4 final media readiness`, sin implementación ni cambios de contratos compartidos. Hash en respuesta final / `git rev-parse HEAD`; no autorreferencia de hash dentro del mismo commit. Sin push, PR ni modificación backend.

Hay primitivas legítimas para sesión contextual y completion active, pero faltan enlaces/consulta finales, garantías de lectura/RBAC completas, evidencia de navegador/R2 y entorno E2E, además de orquestación frontend. B04 Phase A **no** cierra B04 ni Sprint 4. La matriz y bloqueadores anteriores son el criterio para volver a auditar.

[B01]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/docs/S4-B01-media-contract.md
[B02]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/docs/S4-B02-media-integrity.md
[B03]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/docs/S4-B03-media-idempotency.md
[B04]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/docs/S4-B04-media-associations.md
[BR]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/docs/api/reception-contract.md
[B-ROUTES]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/src/media/routes.ts
[B-SERVICE]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/src/media/service.ts
[B-BINDING]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/src/media/operational-binding.ts
[B-R2]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/src/media/r2.ts
[B-TEST]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/tests/media-api/operational-binding.test.cjs
[B-FIXTURES]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/tests/media/fixtures/README.md
[B-R2-TEST]: https://github.com/IvanBy12/TallerMecarioB/blob/ec14ba7eb81e65d08f099f0466a1eb99688478e7/tests/media/upload-flow.test.cjs

S4-F07 READINESS: BLOCKED
