# S4-F07-C — Operational Media Read, Gallery & Final E2E Gate

Fecha: **2026-10-10, America/Bogota**. Responsable: Codex, implementación y
verificación frontend. **Fase 3 real: BLOCKED. Quality Gate Sprint 4: NOT_READY,
no PASSED.** El cambio local se prepara para revisión independiente; esta ejecución
no constituye esa revisión ni autoriza push, PR, merge, despliegue o release.

La evidencia original siguiente corresponde al HEAD revisado
`e1d38acd5479185645f8b259479d47924fe7955d`. Se conserva como historial; el
addendum F-1/F-2 al final registra el patch adicional y sus gates de re-review.

## Versión, ambiente y autoridad

- Rama: `task/s4-f07-c-media-final-gate`.
- Base: `98da61425adcdfb43391abfcbc8f0188f8551f9e`; worktree inicialmente limpio,
  `/Users/ivanby/Documents/Proyectos/TallerMecario-worktrees/s4-f07-c-media-final-gate`.
- Commit de entrega original: `e1d38acd5479185645f8b259479d47924fe7955d`.
  El commit adicional de correcciones se identifica en el addendum y handoff;
  no sustituye ni reescribe esta evidencia original.
- macOS, Node **v22.23.3**, npm **10.9.9**, versiones compatibles con `.nvmrc` y engines.
  Dependencias fijadas ya presentes en el checkout principal, usadas mediante enlace
  local temporal `node_modules`, retirado al entregar. No dependencia/lockfile nuevo.
- Vitest/jsdom + Playwright Chromium local. Sin autenticación Clerk real, API
  desplegada, PostgreSQL ni bucket R2 certificados por estas ejecuciones.
- Backend solo leído: TallerMecarioB HEAD
  `56c6e056934d271ada3c7ace667cdd2dbe809da3`, limpio; no comandos de escritura,
  pruebas backend, DB, políticas R2 ni proxies.
- Fuente canónica: [Quality Gates — Reglas y Pruebas por Sprint](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573),
  §§1, 2, 7, 21 y 22. Leída mediante el conector Notion el 2026-10-10; el resultado
  identifica `page_last_edited_at/as of = 2026-10-06T01:53:14.555Z` y
  `verification.state = unverified` (no certificación del sprint). El fetch no informó
  truncación/bloques desconocidos; se inspeccionaron las cinco secciones completas.
  §7 coincide con el extracto local `docs/quality/frontend-relevant-gates.md`.
  No se modificaron Notion ni los snapshots compartidos.

## Contratos reutilizados y alcance

[Informe F07-A](s4-f07-a-operational-media-adapter.md) y contratos publicados
[B04 Phase B — Attach and list API](https://github.com/IvanBy12/TallerMecarioB/blob/56c6e056934d271ada3c7ace667cdd2dbe809da3/docs/S4-B04-media-associations.md),
[B01 §9 — Download](https://github.com/IvanBy12/TallerMecarioB/blob/56c6e056934d271ada3c7ace667cdd2dbe809da3/docs/S4-B01-media-contract.md):

| Operación | Contrato usado |
| --- | --- |
| Lista | `GET /api/v1/receptions/:receptionId/media`, sin query/paginación; `{ media: MediaDto[] }`; `media.read`, tenant; `no-store` |
| Descarga | `GET /api/v1/media/:mediaAssetId/download-url`; `{ mediaAssetId, downloadUrl, expiresAt }`; identidad exacta y URL HTTPS validada por F07-A; TTL máximo publicado 300 s |
| Contexto | `ReceptionProvider` suministra la misma instancia de `createReceptionOperationalMediaApi`, `ApiClient`, tenant y AbortSignal verificados; contexto cancelado/remontado al cambiar identidad/tenant/permisos efectivos |
| Flujo previo | F07-A/F07-B mantienen session → PUT firmado directo → complete active → attach explícito; esta tarea no modifica ese flujo |

El listado es la única fuente de medios: no se agregan archivos seleccionados,
assets únicamente completados o IDs inferidos del detalle. Orden recibido intacto;
se distinguen `photo`, `video`, `video360`; propósito `intake_evidence`. Metadatos
nullable siguen aceptados. Recepciones históricas/cerradas conservan checklist,
daños, notas, estado y orden asociada. Errores de media no borran esos datos.

Estados: loading, empty, error y loaded. Cada medio tiene «Ver», acceso temporal
loading, visualización o error y «Ocultar»; controles de video nativos, sin autoplay,
`preload=none`. No hay miniaturas/binarios automáticos al listar. La foto solo se
carga tras «Ver»; video solicita URL tras «Ver» y bytes al reproducir según el
navegador. No visor panorámico inventado: video360 queda identificado como tal.
Teclado, nombres accesibles y anchos 390/1280 se comprueban en Chromium sintético.

El guard exige `media.read` con scope tenant. Scope assigned queda fail-closed por
B04/B07 pendiente; un ID es selector de recurso, nunca credencial. El servidor sigue
revalidando pertenencia, autorización, estado active y marcadores de eliminación.
No media de daños, firma, retención frontend ni persistencia offline añadidos.

### URLs firmadas y cancelación

- Se solicitan solo por acción explícita, sin prefetch ni renovación automática.
  Cada nueva apertura solicita autorización de nuevo. No enlaces permanentes.
- F07-A valida identidad, URL HTTPS sin credenciales/fragmentos ni escapes inseguros
  y timestamp. Una respuesta ya vencida no se monta en img/video.
- Capacidad solo en estado React/DOM mientras se visualiza. Timer y revalidación
  en focus/pageshow/visibilitychange la retiran al expirar. Ocultar, error, cambio
  de contexto o navegación desmontan la vista y liberan la capacidad; video además
  pausa, retira src y ejecuta load para interrumpir reproducción/recurso pendiente.
- Señal local combinada con la del provider; cancelar/unmount aborta consultas.
  Las respuestas tardías no actualizan el nuevo contexto ni una vista cancelada.
- `crossOrigin=anonymous` evita credenciales de storage; foto usa no-referrer.
  Ningún token Clerk/header tenant se envía por el visor al storage.
- Sin Files/Blobs, URL firmada en localStorage/sessionStorage/IndexedDB, logging,
  analytics, errores o referencia de solicitud de media. Copy fijo por fallo;
  incluso `message/request_id` malicioso que contiene URL no llega a la UI.
- GET 401 conserva el único refresh de token de F07-A; 403/404 no disparan retries.
  429 respeta Retry-After con el hook existente; la reconsulta es manual. Errores de
  img/video retiran src y ofrecen nueva solicitud explícita, sin replay automático.
- Expiración usa el reloj local para UX; el storage/servidor impone el vencimiento
  real. Bytes ya vistos o una capacidad emitida no adquieren revocación instantánea
  por desmontar la UI. B01 explicita ese límite de capacidades temporales.
- Cache-Control del objeto, CSP del despliegue, CORS y controles efectivos de R2
  siguen pendientes de evidencia real. Un atributo de navegador no prueba políticas
  del bucket ni autoriza relajar CSP/CORS para que pase el gate.

## Pruebas y resultados

Resultado final de comandos sobre el contenido del commit original `e1d38acd5479185645f8b259479d47924fe7955d`:

| Verificación | Resultado | Naturaleza |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript local |
| `npm run lint` | PASS, 0 warnings | ESLint local, sin supresiones |
| `npm test -- src/features/reception src/shared/media` | PASS 875/875, 21 archivos | Regresión F07-A/F07-B + galería, sintética |
| `npm test` | PASS 1308/1308, 48 archivos | Suite completa sintética |
| `npm run test:e2e:harness` | PASS 191/191, 11 archivos | Harness y Chromium con servicios simulados |
| `npm run build` | PASS; warning chunk >500 kB | Build local; no deploy ni CI remoto |
| `git diff --check` | PASS | Higiene del patch local |
| E2E real Clerk/API/R2 | BLOCKED / NO EJECUTADO | Sin entorno/credenciales de prueba |
| R2/CORS real desde origen permitido | BLOCKED / NO EJECUTADO | Ninguna solicitud real realizada; no curl/mock considerado prueba |

Última ejecución del harness: `HARNESS_KEEP_OUT=1 npm run test:e2e:harness`.
Reporte secure local en
`/var/folders/_7/kzlf6w351z11_2mcs7tn_kxc0000gn/T/tm-e2e-harness-secure-0Ew6Ym/report.json`:
39 casos Chromium, 36 passed y los 3 failed deliberados exigidos por el harness;
los **4 casos F07-C passed**. El control negativo y el scanner de todos los canales
persistibles pasaron sus assertions. Este artefacto temporal es sintético y puede
eliminarse; las fixtures/specs versionadas reproducen la evidencia. Los assets del
build no contienen los dominios/token/URLs sintéticos de la fixture de galería.

`reception-operational-gallery.test.tsx`: **37 casos** de integración a través del
provider, cliente, adaptador y parsers productivos. Cubre lista vacía; fotos/video/
video360 y orden no reinterpretado; nulls; loading/error/reconsulta; lista malformada
rechazada completa; URL insegura/expirada; timer y reanudación de tab; 401/403/404 en
list y download; asset inaccesible/evento de error del binario; Retry-After;
cancelación local/unmount; abort y respuestas tardías al cambiar identidad/tenant;
pérdida de permisos; histórico cerrado intacto; URLs ausentes de storage/logs/API
requests y errores. Usa datos sintéticos, nunca personas/URLs reales.

`desktop-operational-gallery.spec.ts`: **4 casos Chromium** con HTTP/storage
interceptados. Lista y render de PNG válido bajo demanda, teclado, foto/video360,
preload none, ausencia de credenciales en request storage, ocultación, nueva visita,
expiración sin reuso, cambio de identidad, 404 conservando recepción y layouts de
390/1280. Este spec no ejecuta upload real, decode/playback de video real ni CORS
R2: los headers y las respuestas son simulados. Corre en el harness-desktop,
con viewport mobile explícito en un caso; no representa Safari/iOS ni hardware
móvil real. Reporters usan la política existente sin trace/screenshot/video.

La prueba histórica F05 que exigía placeholder se actualizó al comportamiento
aprobado sin retirar sus assertions de ausencia de captura/upload/firma en detalle.
Ninguna prueba fue deshabilitada. Los primeros runs expusieron el guard de scope,
el fixture tipado incompleto y assertions/lint de los tests nuevos: corregidos
antes de las ejecuciones finales. El harness conserva sus fallos forzados de control;
no se contabilizan como defectos del producto ni se debilita su control negativo.

## Matriz canónica de Notion §7

«Sintético» nunca equivale a PASS real del criterio. Los requisitos backend se
mantienen en la matriz, aunque no se implementen ni certifiquen desde este frontend.

| # | Criterio canónico | Evidencia disponible en esta tarea | Estado global/pending |
| --- | --- | --- | --- |
| 1 | Metadata de retention/deletion/purge | Contrato B01/B05 leído; DTO de galería minimizado | Pendiente evidencia backend; no probado aquí |
| 2 | Incompletos expiran/purgan baseline 24 h | Contrato publicado | Pendiente worker/storage real |
| 3 | Operacional 12 meses tras orden terminal y warranty +90 d | Contrato B01/B05 | Pendiente backend/worker |
| 4 | Firma/PDF/evidencia 36 meses o policy/hold superior | Contrato baseline; fuera de implementación F07-C | Pendiente gate backend, no retirado del gate global |
| 5 | Legal hold impide purge | Contrato baseline | Pendiente prueba backend/storage |
| 6 | deleted_at bloquea signed URLs antes de purge | UI 404/inaccesible sintético | Pendiente B06 y prueba real de todos los deletion markers |
| 7 | Worker respeta vínculo/hold y audita | Contrato publicado | Pendiente ejecución backend/worker |
| 8 | Scan R2 faltante/huérfano | Readiness R0/B08 | Pendiente dependencia B08 y evidencia R2 |
| 9 | Upload session | Regresión F07-A/B sintética | Pendiente ejecución real contextual |
| 10 | URL temporal | Parser F07-A + galería y reloj sintéticos | Pendiente firma/TTL real |
| 11 | Video browser → R2 directo | Regresión transporte F07-A/B | Pendiente PUT/CORS real |
| 12 | Fotos | Captura/upload regresión; PNG en Chromium simulado | Pendiente foto R2 real |
| 13 | Reintento | F04/A/B: ambigüedad sin replay ciego; GET manual/cooldown | Pendiente resiliencia real/idempotencia backend |
| 14 | Upload interrumpido | Regresión F04/A/B; cancelación de lectura | Pendiente interrupción real en navegador/R2 |
| 15 | Archivo inválido rechazado | Regresión validadores/malformed responses | Pendiente rechazo backend/R2 real; duración numérica sin política aprobada |
| 16 | Metadata persistida | DTOs/adaptadores sintéticos | Pendiente round trip real/persistencia backend |
| 17 | Checksum/tamaño cuando aplique | Contrato B02; regresión DTO | Pendiente evidencia HEAD/integridad real |
| 18 | Enlaces específicos por dominio | API reception media reutilizada | Pendiente attach/list persistido real; otros dominios fuera de F07-C |
| 19 | Sin media_links polimórfico en escritura | Request allowlists F07-A/B; C solo GET | Pendiente evidencia backend; ningún cambio DB |
| 20 | Media A no enlaza entidad B | Cancelación/contexto/guards frontend sintéticos | Pendiente negativa API/DB cross-tenant real; no se prueba autorización DB con mocks |
| 21 | URL de descarga expira | Respuesta vencida, timer, tab resume y Chromium simulado | Pendiente negativa signed GET real después del TTL |
| 22 | R2 caído no destruye recepción | Regresión A/B y 404 de vista sin perder detalle | Pendiente outage/interrupción R2 real |
| 23 | Consulta/vista media por orden | Galería de recepción con datos históricos/orden intactos | Consulta por orden no implementada ni certificada; requiere contrato/tarea y evidencia propia |
| 24 | E2E recepción + video + fotos | Componentes integrados + navegador de lectura simulado | **BLOCKED**, requiere servicios provisionados |

## Gate transversal §§1–2 y política §§21–22

| Requisito | Estado y límite |
| --- | --- |
| Criterios de aceptación | Galería frontend implementada; fase real bloqueada |
| TS/lint/unit/domain/errores/negativos | Ejecución local registrada arriba |
| Integración persistencia/proveedores + E2E crítico | BLOCKED real; los tests de adaptadores no lo sustituyen |
| Autorización/RBAC + multitenant | Guards/cancelación sintéticos; pendiente rechazo real de servidor/DB |
| Idempotencia donde hay retry | Regresión F07-A/B; pendiente ejecución backend real |
| Logs/observabilidad | Sin logging/analytics nuevo; assertions anti-fuga locales; pendiente observabilidad del entorno real |
| Migración staging | No cambio DB en C; no certifica migraciones/deploy backend pendientes |
| Rollback/recuperación | Patch frontend reversible tras revisión; no cambia datos/contratos; no recuperación de infra probada |
| Smoke post-deploy + regresión crítica | Local PASS según tabla; CI/staging/smoke reales pendientes |
| Documentación/evidencia | Este informe + fuentes enlazadas; commit local para review |
| Riesgos críticos = 0 | No se certifica seguridad/infra global con pruebas locales |

§21 exige NOT READY por pruebas obligatorias sin ejecutar; no se asigna PASSED por
funcionar local. §22 y la solicitud requieren revisión independiente → correcciones
→ regresión → PR/CI → merge. Esta entrega se detiene en el commit local para revisión.
No hubo push, PR, merge, nueva revisión independiente ni validación CI remota de C.

## Fase 3 — Plan de ejecución real y blockers

Auditoría local sin imprimir valores: no `.env.e2e`/`.env.local` en el worktree ni
`.env.e2e` en el checkout principal. El runner no tiene `VITE_API_BASE_URL`,
`VITE_CLERK_PUBLISHABLE_KEY`, `E2E_BASE_URL`, `E2E_TENANT_ID`, `E2E_USER_EMAIL`,
`E2E_USER_PASSWORD`, `E2E_RESTRICTED_EMAIL`, `E2E_RESTRICTED_PASSWORD`,
`E2E_TENANT_B_ID`, `E2E_TENANT_B_USER_EMAIL`, `E2E_TENANT_B_USER_PASSWORD` ni
`E2E_TENANT_B_RECEPTION_ID`. No se buscó ni expuso material secreto de otros proyectos.
No se deduce que la infraestructura global no exista: **no está provisionada/accesible
para este runner**. El config E2E existente selecciona specs S3; listarlos o ejecutar
el harness no prueba el recorrido S4.

Antes de ejecutar: provisionar un entorno de PRUEBA, origen frontend exacto permitido
por Clerk/API/R2 y CSP, backend compatible con B04 Phase B, bucket privado real,
memberships owner/admin/advisor + identidad restringida + tenant B independiente,
clientes/vehículos/consentimiento verificables y fixtures binarias válidas de foto y
video360 dentro de los límites publicados. Credenciales solo en configuración
privada, nunca `VITE_*` salvo publishable key/origen públicos. Faltan contrato aprobado
de duración numérica y validación B06/B07/B08 según scope global; no inventar reglas.

| Paso real | Evidencia necesaria, sin capacidades/tokens/PII |
| --- | --- |
| 1. Login → tenant → recepción | Clerk real; tenant verificado; aviso/consentimiento y adulto; crear recepción de prueba |
| 2. Seleccionar foto/video360 | Archivos reales permitidos después de consentimiento; validar MIME/tamaño; no Blob persistido |
| 3. Upload session | Request exacto F07-A contextual; respuesta autorizada, ID interno/estado resumidos; no URL firmada en artefactos |
| 4. OPTIONS → PUT directo R2 | Desde el origen permitido real, emitir headers exactos firmados (`Content-Type`, `If-None-Match: *` cuando se emita); sin Authorization/X-Tenant-Id/Cookie al storage; verificar métodos/headers de preflight, status y CORS efectivo, no solo inspección de policy |
| 5. Complete | Backend confirma `active` y asset esperado tras validar objeto; PUT 2xx solo no basta |
| 6. Attach | Asociación explícita a la recepción; sin purpose/tenant/bucket/key inventados; solo success backend permite considerarla asociada |
| 7. Nueva visita al detalle | Nueva lectura API; aparecen únicamente assets asociados, tipos y orden backend |
| 8. Download URL → visualización | Click «Ver»; autorización y no-store; foto visible y video360 realmente reproducible; requests GET/Range reales al storage sin credenciales; verificar CORS/headers expuestos para reproducción cuando aplique |
| 9. Negativos | URL vencida rechazada por storage y nunca reutilizada en UI; 401/403/404, asset eliminado/inactivo, tenant ajeno/permiso restringido; abort/context switch sin respuesta tardía; interrumpir upload/outage sin perder recepción |
| 10. Seguridad + cierre | Reporte método/plantilla de ruta/status/headers permitidos y timestamps; sin query firmada, token, body sensible, trace/HAR/capturas autenticadas; limpieza por flujo autorizado, CI/staging/smoke y decisión independiente |

CORS exige solicitudes reales desde el origen aprobado: medir OPTIONS solicitado por
PUT con todos los headers emitidos y el PUT posterior; probar GET/Range cuando
aplique y origen negativo bajo el procedimiento autorizado. Un GET img/video simple
puede no generar OPTIONS; registrar la ausencia esperada, no afirmar preflight sin
observarlo. No manipular políticas R2, proxies, navegador/security ni endpoints para
lograr PASS. No usar un HEAD/curl o headers simulados como sustituto.

Los reportes Chromium locales son exclusivamente sintéticos. No se adjunta un run
real inexistente. La evidencia real de CORS/R2, persistencia, rechazo de autorización,
video reproducible, entorno, CI y staging permanece pendiente.

## Defectos, riesgos y decisión

- Defectos encontrados durante desarrollo: guard inicial aceptaba assigned,
  fixture de contexto quedó incompleto tras exponer read API y test F05 esperaba
  placeholder histórico. Corregidos y cubiertos sin retirar la seguridad existente.
- Limitación conocida del build: warning existente de chunk >500 kB; no bloqueante
  para este patch, sin suprimirlo ni introducir paquetes.
- Backend/documentos: B01 conserva notas históricas de purpose/contexto/descarga;
  B04 Phase B es el contrato específico aprobado ya fijado por F07-A. Se conserva
  la reconciliación DOC_CONFLICT de F07-A, sin alterar contratos compartidos. B06,
  B07, B08, duración y evidencia de retención/integridad no se declaran resueltos aquí.
- Riesgo residual: servidor/storage/reloj/TTL/cache/CSP/CORS y reproducción dependen
  del ambiente real; capabilities emitidas no se revocan instantáneamente por cerrar
  la UI. No hay prueba de aislamiento/retención real de backend en esta entrega.
- Revisión independiente pendiente sobre este commit; correcciones, regresión
  posterior al review, PR/CI y merge quedan en ese orden. Sin push ni PR solicitado.

**Decisión: frontend preparado para revisión independiente; fase E2E real BLOCKED;
Quality Gate Sprint 4 NOT_READY. Estado global S4-F07-C: BLOCKED por evidencia real
pendiente. No Sprint 4 PASSED ni release habilitado.**

## Addendum — Correcciones F-1/F-2 para re-review independiente

Fecha: **2026-10-10, America/Bogota**. Solicitud: corregir exactamente los dos
findings accionables del review independiente `S4-F07-C CODE REVIEW: FINDINGS`.
Base de rama `98da61425adcdfb43391abfcbc8f0188f8551f9e`; HEAD revisado y padre de
este patch: `e1d38acd5479185645f8b259479d47924fe7955d`. Worktree/rama originales,
inicialmente limpios. El HEAD corregido es el commit local adicional que contiene
este addendum, resoluble con
`git log -1 --format=%H -- docs/quality/s4-f07-c-media-final-gate.md`; su SHA exacto
se informa en la entrega. Mensaje requerido:
`fix(reception): preserve gallery focus and test reception isolation`.

### F-1 — MEDIUM: foco al alternar Ver/Ocultar

Reproducción realizada **antes de cambiar producción**, sobre el HEAD revisado,
con las nuevas pruebas añadidas al worktree:

- Vitest: 44 casos de galería, **40 passed / 4 failed**. Los 37 previos y las tres
  regresiones F-2 pasaron; los cuatro nuevos F-1 fallaron. Fallos de identidad del
  control durante loading/cancelación y `document.activeElement = body` en
  transiciones a error/ready.
- Chromium: **5/5 nuevas pruebas F-1 failed**. En el ciclo por click, después de
  ready se observó literalmente `Expected BUTTON / Received BODY`; Enter, error y
  expiración perdieron el control enfocado. Cancelar por Enter durante loading
  tampoco encontraba un control Ver habilitado: seguía el botón original disabled.
- Reporte previo sintético:
  `/private/tmp/tm-s4-f07-c-fixes-before/report.json`; salida del runner en el mismo
  directorio. Comando directo con `HARNESS_OUT_DIR` apuntando allí,
  `HARNESS_SUITE=secure`, config `e2e-harness-tests/browser/playwright.harness.config.ts`,
  spec `desktop-operational-gallery.spec.ts`, filtro `--grep F-1`. Estos fallos son
  reproducción del defecto, no fallos forzados del harness.

Corrección mínima: `GalleryItem` mantiene **un solo botón nativo, siempre en el
mismo lugar y con la misma identidad DOM**. Idle/error: «Ver» abre una consulta;
loading/ready: «Ocultar» cancela u oculta. Durante loading permanece habilitado para
cancelar. El bloqueo Retry-After existente sigue aplicándose al solicitar acceso.
`aria-expanded` refleja la visualización; nombres accesibles conservan tipo y
posición del medio. No autofocus, movimiento programático de foco ni cambio de
ApiClient/adaptador/hook/transportes. Las regiones status/alert existentes permanecen.

Resultados tras la corrección: **44/44** pruebas de galería; **9/9 Chromium**,
compuestos por los cuatro escenarios originales y cinco nuevos F-1. Clic y Enter
mantienen `document.activeElement === botón_original` en loading/ready/hide y tres
ciclos consecutivos; error, expiración y cancelación conservan ese mismo control.
Los nombres se comprueban por role/name y los conteos de download demuestran una
solicitud por apertura, ninguna por ocultar/cancelar y ninguna renovación automática.
Cancelación aborta la consulta y descarta la respuesta tardía. No se retiraron
assertions, tests, casos negativos ni controles de privacidad.

La cobertura usa controles HTML nativos y nombres/roles accesibles calculados por
el navegador. No se presenta como una sesión manual con un lector de pantalla
real: esa validación asistiva de campo no se ejecutó en este entorno.

### F-2 — LOW: cambio de receptionId en la composición real

Tres nuevas pruebas con `renderReception`, AppRoutes/RouterProvider,
ReceptionProvider, ReceptionDetailPage, galería, adaptador, cliente y parsers reales;
solo las respuestas HTTP y el recurso de media son sintéticos. **3/3 pasaron antes
y después de F-1. No se necesitó corrección productiva F-2.**

1. Recepción A lista video360 y foto. Su video usa una capacidad visible, y una
   segunda descarga queda pendiente. Se navega mediante `router.navigate` a B:
   la vista anterior desaparece antes de resolver el listado B; la URL A ya no
   está en DOM; el video A se desconecta, pausa, retira src y ejecuta load; la
   descarga A pendiente se aborta. Resolver tarde A no crea un visor. B carga su
   propia lista y solicita su propio asset únicamente al pulsar Ver. Se comprueban
   los receptionIds exactos de ambas listas, los mediaAssetIds de cada download y
   que solo la URL B queda visible, sin reutilizar la anterior.
2. List A pendiente → ruta B → respuesta A tardía: el request anterior está
   abortado, B conserva exclusivamente su video en el listado, sin download
   automático ni medios A visibles.
3. Mismo escenario con cambio de tenant: después de navegar se remonta el contexto,
   y el nuevo listado usa `receptionId=B` y `X-Tenant-Id` del tenant nuevo. La
   respuesta A tardía no reaparece. Esta prueba acredita aislamiento del estado
   frontend, no sustituye autorización/aislamiento real del backend.

### Gates de la corrección

Mismo ambiente local Node v22.23.3/npm 10.9.9 y dependencias fijadas de la entrega
original; enlace temporal node_modules retirado antes de entregar. Sin dependencias
nuevas, backend, upload client, contratos, navegación F07-B ni CORS modificados.

| Comando/caso | Resultado final |
| --- | --- |
| Nuevas pruebas + galería completa | PASS 44/44; 4 F-1 + 3 F-2 nuevos |
| Chromium directo, originales + F-1 | PASS 9/9; 4 originales + 5 nuevos |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 warnings |
| `npm test -- src/features/reception` | PASS 550/550, 11 archivos |
| `npm test -- src/shared/media` | PASS 332/332, 10 archivos |
| `npm test` | PASS 1315/1315, 48 archivos |
| `npm run test:e2e:harness` | PASS 191/191, 11 archivos |
| `npm run build` | PASS; mismo warning chunk >500 kB |
| `git diff --check` | PASS |

El primer lint de la corrección encontró cuatro guards `button === null`
inaplicables al tipo no nullable devuelto por Locator.elementHandle; se retiraron
solo esas ramas imposibles, sin suprimir diagnostics ni assertions. El locator
espera/exige que exista el control y falla por sí mismo si falta. Se repitieron
lint/typecheck y el harness con las pruebas Chromium finales.

Reporte Chromium directo posterior en
`/private/tmp/tm-s4-f07-c-fixes-after/report.json`. Los reportes antes/después son
sintéticos y temporales, con trace/screenshot/video deshabilitados. Las pruebas
versionadas reproducen la evidencia; no se adjuntan secretos ni capacidades reales.
Último reporte secure del harness:
`/var/folders/_7/kzlf6w351z11_2mcs7tn_kxc0000gn/T/tm-e2e-harness-secure-Rb6NQ8/report.json`.
44 casos Chromium: 41 passed y los 3 failed deliberados requeridos por el harness;
los nueve de galería (4 originales + 5 F-1) passed. Los controles de privacidad,
reporters y F07-B FIX-01 mantuvieron sus assertions. Los fallos deliberados
secure/control del harness original siguen siendo exigidos y no se confunden con
F-1 ni con defectos del patch.

### Límites y decisión de re-review

Se conservan todas las limitaciones de la entrega original: reloj local para UX de
expiresAt (clock skew puede retirar antes o después; servidor/storage es autoridad),
URLs solo bajo demanda/sin persistencia ni logging y cleanup/abort vigentes.
`crossOrigin=anonymous` sigue presente: la validación real de lectura requiere
GET/Range desde el origen frontend autorizado, además de OPTIONS/PUT firmado.
No se introduce compensación temporal ficticia, proxy ni relajación de CORS.

**E2E real Clerk/API/R2 y CORS: BLOCKED por entorno, no ejecutados. Sprint 4 sigue
NOT_READY.** Los resultados Chromium corresponden a servicios interceptados y no
certifican R2 ni video real, staging o CI remoto. Ningún cambio backend ni revisión
independiente nueva ejecutada por esta implementación.

**Decisión de fixes: pendiente de re-review independiente del commit local.**
Tras ese review: correcciones si procede → regresión → PR/CI → merge, en ese orden.
Esta entrega no hace push ni PR y no declara Sprint 4 PASSED.

## Addendum — Auditoría final de aceptación y Quality Gate (S4-F07-C)

Fecha: **2026-10-11, America/Bogota**. Alcance: auditoría documental; no
modifica producción, tests, contratos ni Notion, y no vuelve a ejecutar suites.
Commit auditado: `4c0066860ded1a9f8c7a5769f6342d45d9071827` (base
`98da61425adcdfb43391abfcbc8f0188f8551f9e`; rama `task/s4-f07-c-media-final-gate`).
Ejecutor de la auditoría: Claude Code (Sonnet 5.5). Implementación original:
Codex. Ambiente de la evidencia citada: macOS, Node v22.23.3/npm 10.9.9, Vitest/jsdom
y Playwright Chromium locales con servicios interceptados. **No es un ambiente
real** (sin Clerk, API desplegada, PostgreSQL ni R2).

Este addendum **no reescribe** las secciones anteriores: su decisión «BLOCKED /
NOT_READY» sobre el commit `e1d38acd` y el addendum F-1/F-2 permanecen como
historia. Aquí solo se consolida y se separa el estado incremental del global.

Fuentes consultadas: `AGENTS.md`; este informe; informes F07-A/F07-B enlazados
arriba; Notion «Quality Gates — Reglas y Pruebas por Sprint» (§1, §2, §7, §21),
leído por el conector el 2026-10-11 (página `as of 2026-10-06T01:53:14.555Z`,
`verification.state = unverified`); y el re-review independiente de `4c006686`.
§7 de Notion coincide con los 24 criterios de la matriz canónica anterior.

### Matriz de aceptación

Estados: **PASS** = evidencia local verificada (no equivale a PASS real del
criterio global); **BLOCKED** = requiere ambiente/backend real no disponible;
**NOT_APPLICABLE** = fuera del alcance del ticket frontend.

#### A. Funcionalidad F07-C implementada

| ID | Criterio | Implementación | Prueba | Resultado | Evidencia | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Listar medios asociados a la recepción, orden y tipos sin reinterpretar | `useOperationalGallery`, `ReceptionOperationalGallery` | `reception-operational-gallery.test.tsx` | Fotos/video/video360 en orden recibido; nulls aceptados; lista malformada rechazada completa | Galería 44/44 | PASS |
| A2 | Estados loading / vacío / error / cargado + reconsulta manual | Hook y componente | Mismo archivo | Cubiertos con 401/403/404/429 y copy fijo | Galería 44/44 | PASS |
| A3 | URL temporal solo bajo demanda («Ver»), sin prefetch ni binarios al listar | `useOperationalMediaView.open` | Mismo archivo; Chromium `desktop-operational-gallery.spec.ts` | Una solicitud por apertura; ninguna por ocultar/cancelar | Galería 44/44; Chromium 9/9 | PASS |
| A4 | Expiración y revocación local de la capacidad | Timer + `focus`/`pageshow`/`visibilitychange`; respuesta vencida no se monta | Mismo archivo; Chromium expiración | Vista retirada al vencer; sin renovación automática | Galería 44/44; Chromium 9/9 | PASS (reloj local) |
| A5 | Liberación de URL y recurso al ocultar, error o cambio de contexto | Desmontaje img/video; `pause`/`removeAttribute('src')`/`load` | Mismo archivo; F-2 | Verificado en DOM y mocks de `HTMLMediaElement` | Galería 44/44 | PASS |
| A6 | Autorización UX `media.read` scope tenant; assigned fail-closed | Guard del hook | Mismo archivo | Sin permiso no hay consulta ni controles | Galería 44/44 | PASS (UX; el backend es la autoridad) |
| A7 | Accesibilidad y foco: botón persistente (F-1) | `GalleryItem` con un único `<button>` | 4 componente + 5 Chromium F-1 | Misma identidad DOM; foco conservado en loading/ready/ocultar/error/expiración/cancelación | Antes 4 + 5 fallan, después pasan (re-review independiente) | PASS |
| A8 | Aislamiento entre recepciones y tenant en el frontend (F-2) | `key={receptionId}` en `reception-detail-page.tsx` + abort del hook | 3 pruebas de composición real | Vista A retirada, lista/descarga A abortadas, respuesta tardía no aplicada, B usa su `receptionId`/`X-Tenant-Id` | Galería 44/44 | PASS (estado frontend) |
| A9 | Histórico/cerrado, checklist, daños y orden intactos ante errores de media | Detalle de recepción sin cambios | Pruebas F07-C y regresión F05 | Errores de media no borran el detalle | Recepción 550/550 | PASS |

#### B. Seguridad y regresiones locales

| ID | Criterio | Implementación | Prueba | Resultado | Evidencia | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | URL firmada no persiste (storage, IndexedDB, logs, errores, API requests) | Solo estado React | Galería + scanner del harness | Ausente en todos los canales persistibles | Galería 44/44; harness 191/191 | PASS |
| B2 | Sin credenciales al storage; `crossOrigin=anonymous`, no-referrer | Atributos de `img`/`video` | Chromium (`storageCredentials=false`, `binaries=0` en error) | Sin Authorization/X-Tenant-Id/cookie hacia storage simulado | Chromium 9/9 | PASS (sintético; CORS real en D) |
| B3 | Sin firma digital, captura nueva ni persistencia offline | Sin cambios | Regresión F05/F07-A/B | Assertions de ausencia vigentes | Recepción 550/550; media 332/332 | PASS |
| B4 | Protección de navegación F07-B FIX-01 y flujo upload→complete→attach | Sin cambios | Regresión F07-B | Intacto | Recepción 550/550 | PASS |
| B5 | Sin cambios backend/contratos/dependencias/adaptador/hook/cliente en F-1/F-2 | Diff `e1d38acd..4c006686` = 4 archivos, 7 líneas productivas | Re-review independiente | Confirmado | Diff + `git diff --check` limpio | PASS |
| B6 | Calidad estática y build | — | typecheck, lint (0 warnings), build | PASS; warning de chunk >500 kB preexistente | Re-review independiente | PASS |

#### C. Evidencia de navegador con servicios simulados

| ID | Criterio | Prueba | Resultado | Evidencia | Estado |
| --- | --- | --- | --- | --- | --- |
| C1 | Recorrido lista → Ver → ocultar → nueva visita, 390 y 1280 px | `desktop-operational-gallery.spec.ts` (4 originales) | Pasan | Chromium 9/9 | PASS (simulado) |
| C2 | Foco, teclado (click y Enter), error, expiración y cancelación | 5 casos F-1 | Pasan; fallaban antes de la corrección | Chromium 9/9 | PASS (simulado) |
| C3 | Harness completo sin regresión | `npm run test:e2e:harness` | 191/191; 44 casos Chromium = 41 passed + 3 fallos deliberados exigidos por el control | Re-review independiente | PASS (simulado) |

Estos resultados provienen de respuestas HTTP interceptadas. **No equivalen a E2E
real de Clerk/API/R2, ni a reproducción real de video, ni a CORS efectivo.**

#### D. Integración real no ejecutada por falta de ambiente

| ID | Criterio (Notion §7 y Fase 3) | Razón | Estado |
| --- | --- | --- | --- |
| D1 | HTTPS frontend real con origen autorizado (Clerk/API/R2/CSP) | No provisionado | BLOCKED |
| D2 | Clerk real y membresías autorizadas (owner/admin/advisor, restringida, tenant B) | Sin credenciales de prueba | BLOCKED |
| D3 | API operacional alcanzable con B04 Phase B | Sin entorno | BLOCKED |
| D4 | PostgreSQL con fixtures válidos | Sin entorno | BLOCKED |
| D5 | Bucket R2 de prueba privado | Sin entorno | BLOCKED |
| D6 | CORS real: OPTIONS/PUT firmado y GET/Range desde el origen permitido | Sin solicitudes reales | BLOCKED |
| D7 | Upload real de foto y video360, complete → attach | Sin entorno | BLOCKED |
| D8 | Nueva consulta con asociación persistida real | Sin entorno | BLOCKED |
| D9 | URL firmada temporal real y rechazo del storage tras el TTL | Sin entorno | BLOCKED |
| D10 | Video360 realmente reproducible; R2 caído/interrumpido sin perder recepción | Sin entorno | BLOCKED |
| D11 | E2E remoto, CI remoto, staging y smoke post-deploy | No ejecutados | BLOCKED |
| D12 | Validación asistiva con lector de pantalla real | No ejecutada en este entorno | BLOCKED |

**Clock skew** se registra como limitación conocida y **no como prueba
realizada**: la expiración usa el reloj local para UX; el storage/servidor es la
autoridad. Una capacidad ya emitida no se revoca instantáneamente al cerrar la UI.

#### E. Criterios globales de Sprint 4 fuera del alcance de este ticket frontend

| §7 | Criterio | Estado | Justificación |
| --- | --- | --- | --- |
| 1–8 | Retention/deletion/purge, incompletos 24 h, 12 meses/warranty, 36 meses, legal hold, `deleted_at`, worker, scan R2 | NOT_APPLICABLE al frontend / BLOCKED a nivel Sprint | Backend/worker/storage; no hay evidencia suficiente en este ticket |
| 9–17 | Upload session, URL temporal, video→R2, fotos, reintento, interrumpido, inválido, metadata, checksum | Regresión local PASS; real BLOCKED | Evidencia real en D |
| 18–20 | Enlaces por dominio, sin `media_links` polimórfico, A no enlaza B | NOT_APPLICABLE (aplicación en servidor/DB) | Frontend solo emite GET; negativa real pendiente en backend |
| 21–22 | Descarga expira, R2 caído no destruye recepción | Local PASS; real BLOCKED | D9 y D10 |
| 23 | Consulta/vista media **por orden** | NOT_APPLICABLE a F07-C (galería por recepción); BLOCKED a nivel Sprint | Requiere contrato/tarea propios; no se declara cubierto |
| 24 | E2E recepción + video + fotos | BLOCKED | Requiere servicios provisionados |

### Cierre de findings (historia conservada)

| ID | Severidad | Resultado | Cierre |
| --- | --- | --- | --- |
| F-1 | MEDIUM | Pérdida de foco a `document.body` al desmontarse «Ver»/«Ocultar» | Corregido con botón persistente de identidad DOM estable. Regresiones antes/después verificadas de forma independiente (4 componente y 5 Chromium fallaban contra `e1d38acd`; pasan en `4c006686`) |
| F-2 | LOW | Faltaba regresión de cambio de recepción/tenant en la composición real | Tres pruebas de integración añadidas; el comportamiento productivo existente quedó confirmado, sin cambio productivo |
| LOW `aria-expanded` | LOW | Planteado en el re-review `S4-F07-C RE-REVIEW: FINDINGS` | **Adjudicado NOT_A_FINDING** |

El veredicto textual `S4-F07-C RE-REVIEW: FINDINGS` queda registrado tal cual: el
único hallazgo de ese re-review fue ese LOW, y su resolución es esta adjudicación
posterior, no una reescritura del resultado.

Fundamentos de la adjudicación del LOW (según la adjudicación aportada a esta
auditoría; las referencias W3C no fueron re-verificadas en esta ejecución):

- `aria-expanded={state.kind === 'ready'}` corresponde a la visibilidad real de la
  evidencia.
- Durante loading la evidencia aún no está expandida, de modo que `false` es
  correcto.
- Cambiar el nombre accesible del botón no viola la regla aplicable a `aria-pressed`.
- La ausencia de `aria-controls` no fue demostrada como defecto.
- No hubo modificación productiva.
- La adjudicación fue **estática**, por inspección y referencias; **no es una nueva
  ejecución de pruebas** ni validación con lector de pantalla.

### Evidencia técnica consolidada (sin reejecución)

Fuente: re-review independiente sobre `4c006686`, ejecutado el 2026-10-10 sobre una
copia exportada del commit; el worktree quedó sin modificaciones.

| Gate | Resultado |
| --- | --- |
| Galería | 44/44 |
| `src/features/reception` | 550/550 |
| `src/shared/media` | 332/332 |
| Suite completa | 1315/1315 |
| Harness | 191/191 |
| Chromium sintético (galería) | 9/9 |
| typecheck / lint / build | PASS |
| `git diff e1d38acd..4c006686 --check` | PASS |
| F-1 contra `e1d38acd` | 4 componente + 5 Chromium fallan (`BODY`) |
| F-2 sin cambio productivo | Pasan también contra el componente original |

### Registro del Gate (Notion §2)

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-11 (evidencia local 2026-10-10) |
| Versión/commit | `4c0066860ded1a9f8c7a5769f6342d45d9071827` sobre base `98da614` |
| Ambiente | Local sintético (Vitest/jsdom, Chromium interceptado); sin staging ni real |
| Responsable | Implementación Codex; re-review y auditoría Claude Code |
| Casos ejecutados | Los de la tabla anterior; ningún caso real |
| PASS/FAIL | Local PASS; real BLOCKED |
| Defectos | Sin defectos accionables abiertos; F-1 y F-2 cerrados; LOW adjudicado NOT_A_FINDING |
| Decisión | Ver siguiente sección |

### Decisión

**Estado F07-C incremental: READY_FOR_PR.** El código y su evidencia local
permiten preparar el PR del alcance incremental; la ausencia de infraestructura
real **no es un defecto de código**. Pendiente conforme al flujo §22: PR, CI remoto
y merge. Esta auditoría no hace commit, push ni PR.

**Estado Sprint 4: NOT_READY.** Existen pruebas obligatorias no ejecutadas (§21) y
criterios backend sin evidencia suficiente (D y E). No se declara READY_FOR_GATE,
TESTING ni PASSED, y local/sintético no se presenta como éxito real. Sprint 4 solo
podrá evaluarse tras la ejecución real con evidencia.

`S4-F07-C GATE AUDIT: READY_FOR_PR`
