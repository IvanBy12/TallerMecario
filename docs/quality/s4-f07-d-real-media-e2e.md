# S4-F07-D — Real Media Integration & E2E

Fecha de preparación inicial: 2026-10-12. Correcciones H-1–H-6: 2026-10-13, America/Bogota. Preparación para **re-review independiente**.
**S4-F07-D FIXES: READY_FOR_RE_REVIEW**. **S4 REAL E2E: BLOCKED / NO EJECUTADO**.
**Sprint 4: NOT_READY**. Los tests sintéticos nunca se contabilizan como integración real.

## Alcance y revisión

Worktree: `/Users/ivanby/Documents/Proyectos/TallerMecario-worktrees/s4-f07-d-real-media-e2e`.
Rama: `task/s4-f07-d-real-media-e2e`. Base de esta adaptación: `5f93740684ae47c481f58e5604f7ec81bc4ba910`.
Implementación inicial: `5de4e2ea3810690a3b213749d3f1d6ec4e820002`.
La nueva instrucción del propietario reemplaza la obligación de aprovisionar tres personas/IDs S3 para multimedia S4.
La adaptación inicial se recibió sin commit. La instrucción de fixes autoriza un commit local de adaptación + correcciones, sin push ni PR. No cambian producto, backend, contratos compartidos ni políticas R2.

Se revisaron AGENTS, módulos aplicables, auth/env/config/specs S3 y S4, CRM, privacidad, contexto de taller y media.
El informe [recuperación de entorno](s4-f07-d-environment-recovery.md) conserva la evidencia histórica previa a esta adaptación;
sus requisitos de tres personas ya no describen el runner S4 actual.

## Contratos y límites preservados

Identidad/contexto: [contrato /me y /me/context](../api/me-and-workshop-context.md).
CRM: [contratos de clientes, vehículos y propietarios](../api/crm.md).
Recepción/privacidad: Track A `TallerMecarioB/docs/api/reception-contract.md`.
Media: `TallerMecarioB/docs/S4-B01-media-contract.md` y `docs/S4-B04-media-associations.md`, Phase A/B.
Backend inspeccionado en lectura: `9732aecbda126c100ce9e04e07ea7b9b86e86987`.

El snapshot frontend `reception-and-media-contract-status.md` mantiene su estado histórico pendiente de Track A.
**DOC_CONFLICT histórico:** se consumen los contratos HTTP específicos publicados y los adaptadores integrados; no se edita el snapshot para justificar código.

Secuencia real: POST upload-sessions contextual → PUT directo R2 con headers firmados exactos → POST complete active → POST asociación → GET lista persistida → URL temporal → GET/Range.
No se proxyan binarios por API, no se envían bearer/cookie/tenant a R2, no se acortan TTLs para pasar tests.
PNG máximo 20,971,520 bytes; video360 MP4 máximo 786,432,000 bytes. Sin límite numérico de duración inventado.
Fixtures sintéticas: PNG 6798 bytes y MP4 AVC/H.264 4492 bytes, 320×180, duración MP4 1.532367 s. El MP4 no representa una captura panorámica física.

## Preflight S4 independiente

`e2e/support/s4-preflight.ts` ya no invoca `missingVariables`, `invalidVariables` ni `e2eEnv` de S3.
No requiere correos/contraseñas, tenant A/B ni una recepción histórica.
Se conserva el bloqueo al cargar configuración, antes de webServer/browser/login, también con `--no-deps`.
`--list` solo descubre tests; no certifica ejecución.

Obligatorios:

| Variable | Uso / fuente segura |
| --- | --- |
| `VITE_API_BASE_URL` | Backend de pruebas existente; `.env` público o proceso |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Development `pk_test_`; rechaza claves live |
| `E2E_S4_R2_ORIGIN` | Origen HTTPS exacto del endpoint R2 existente; ninguna access key al runner |
| `E2E_S4_SANDBOX_FILE` | JSON privado del operador: `environment=test`, `production=false`, `postgresqlFixturesValidated=true`, `frontendOrigin`, `apiOrigin`, `r2Origin` exactos |

El campo existente `postgresqlFixturesValidated` certifica una DB sandbox apta para datos sintéticos; no exige los IDs/personas históricos S3.
El operador debe acreditarlo; el runner no fabrica esa declaración. No prueba CORS, permisos, migraciones ni fixtures efectivos.
Orígenes sin credenciales/path/query, HTTP solo loopback para frontend/API, R2 HTTPS independiente; fixtures locales presentes y dentro de límites.
`VITE_APP_ENV` usa allowlist S4 `local/development/test` normalizada por espacios y capitalización; rechaza `production`, `prod`, `staging` y desconocidos. Ausente/vacío conserva el default local de Vite dev. No hay bypass de estas guardas durante login interactivo.

Opcionales:

- `E2E_S4_PUBLIC_ENV_FILE`: archivo público existente. El cargador S4 importa únicamente `VITE_APP_ENV`, `VITE_API_BASE_URL` y `VITE_CLERK_PUBLISHABLE_KEY`; las variables ya inyectadas prevalecen. No importa otras claves backend ni variables VITE arbitrarias.
- Sin esa ruta, S4 lee `.env` de su propio worktree si existe. `playwright.config.ts` conserva intacta la carga histórica de `.env.e2e`.
- `E2E_BASE_URL`: frontend Vite Development externo con origen exacto aprobado en el manifest; no se inicia Vite local. Omitido = Vite local con `reuseExistingServer=false` y `--strictPort`. Un build estático externo sin módulo inspeccionable queda BLOCKED.
- `E2E_S4_INTERACTIVE_LOGIN=1`: habilita login manual en navegador visible; prohibido en CI. Sin flag, falta de sesión válida bloquea con mensaje fijo.

Plantilla exclusiva: [e2e/s4.env.example](../../e2e/s4.env.example). Los valores privados van en `.env.e2e` ignorado o proceso, nunca en la plantilla.

## Sesión y autorización actuales

Un único setup S4 comprueba `/health/live` y `/health/ready` 200 con DB ready, antes de intentar autenticación.
Luego busca estados Playwright JSON regulares en `e2e/.auth/`, priorizando `s4.json`. Omite enlaces simbólicos y directorios.
Lee estados anteriores S3 como candidatos; no los sobrescribe.

Cada candidato se abre en contexto de navegador aislado y se valida en vivo:

1. Clerk debe cargar y tener sesión `active`; obtiene un token actual dentro del navegador.
2. GET `/api/v1/me` sin tenant header obtiene memberships ACTIVAS; no usa claims/metadata como autoridad.
3. Consulta `/api/v1/me/context` para memberships devueltas, en orden determinista. Comprueba que tenant/membership/user coinciden con `/me` y que los permisos requeridos tienen scope tenant.
4. Solo después persiste el estado privado S4. Sesiones vencidas, token ausente o identidad sin permisos no se usan para mutaciones. Fallos de servicio/contrato/persistencia no se reclasifican como sesión vencida.

Si no hay candidato válido, el operador puede iniciar sesión manualmente en Clerk Development con UNA cuenta existente. No se solicitan credenciales por terminal, chat ni variables de contraseña. No se crean cuentas, tickets de login ni credenciales nuevas. Tiempo máximo de interacción: 9 minutos; setup hasta 10 minutos.
Estado guardado: `e2e/.auth/s4.json`, chmod 0600; directorio chmod 0700; sin publicación.

Permisos tenant necesarios: `workshop.read`, `media.upload/read`, `receptions.read/create`, `customers.read/create`, `vehicles.read/create`, `vehicle_owners.manage`, `privacy_consents.read/capture`.
Cada escenario habilitado revalida la sesión/membership/permisos y mantiene la misma identidad/taller durante la corrida.
Si hay varias memberships, la UI selecciona el taller con contexto validado; verifica la respuesta backend a esa selección. Nombres ambiguos bloquean antes de mutar, sin adivinar una selección.

## Recursos de cada corrida

POST `/api/v1/customers` crea cliente sintético y devuelve `customerId`.
POST `/api/v1/vehicles` reutiliza ese ID y devuelve `vehicleId` y ownership; valida ambos vínculos.
Sin reintentos de POST CRM ambiguos. La UI busca únicamente el vehículo creado: si no aparece, falla; no crea un duplicado implícitamente.
Consentimiento y recepción conservan la UX real: aviso, propietario vigente, autorización `service_provision` y atestación adulta antes de captura.
S4-01 obtiene `receptionId` directamente de la respuesta POST real, comprueba cliente/vehículo y navegación al mismo ID.
Los IDs de media proceden de respuestas reales correlacionadas. S4-02/05/06 usan los recursos de esta corrida, nunca IDs históricos.
S4-04 crea su propio cliente/vehículo/recepción.
Los datos sintéticos pueden quedar en sandbox para auditoría; no se borra evidencia vinculada ni se modifica un fixture ajeno para limpiar. No hay limpieza amplia ni nueva infraestructura.

## Matriz de cobertura

| Escenario | Identidades necesarias | Preparación actual | Resultado real |
| --- | --- | --- | --- |
| S4-01 recepción → PNG/MP4 → R2 → complete → asociación → nueva visita → decode/playback | Una autorizada | Habilitado; recursos nuevos y IDs API | BLOCKED, no ejecutado |
| S4-02 replay idempotente de asociación y lista persistida inmutable | Misma cuenta | Habilitado; media S4-01 | BLOCKED, no ejecutado |
| S4-03 B no obtiene/asocia media A; persona restringida recibe 403; recepción inmutable | Identidades distintas | `test.skip` con título PENDING explícito | PENDING; jamás PASS |
| S4-04 archivos locales inválidos, cero upload-session y recepción disponible | Una autorizada | Habilitado; recursos propios nuevos | BLOCKED, no ejecutado |
| S4-05 API rechaza MIME/tamaño con 422 y cero PUT | Misma cuenta | Habilitado; contexto S4-01 | BLOCKED, no ejecutado |
| S4-06 misma URL temporal GET 200 → expirada 403 | Misma cuenta | Habilitado; media S4-01; CDP para 403 sin CORS | BLOCKED, no ejecutado |

S4-03 conserva los criterios 404 cross-tenant, 403 PERMISSION_DENIED y no mutación tras attach denegado.
Su implementación inicial permanece en Git `5de4e2e:e2e/s4-media.spec.ts`; no se simula una segunda identidad ni se exige configurarla para los otros cinco casos.
No se sustituye su ejecución por afirmaciones nuevas de suites backend no ejecutadas. La evidencia histórica S3 no prueba el mismo criterio multimedia vigente.
Una futura corrida con cinco PASS y un skip no equivale a seis PASS ni cierra el gate de aislamiento/RBAC.

## Ejecución

Usar Node 22 fijado y las dependencias del lockfile. Configurar solo las cuatro variables obligatorias y la declaración sandbox real.
Puede reutilizarse el `.env` público principal sin copiar secretos:

```sh
export E2E_S4_PUBLIC_ENV_FILE=/Users/ivanby/Documents/Proyectos/TallerMecario/.env
E2E_S4_INTERACTIVE_LOGIN=1 npm run e2e:s4:auth
npm run e2e:s4
```

El primer comando de tests comprueba servicios/guardas, valida estados existentes primero y permite login manual si hace falta.
La corrida normal vuelve a validar el estado guardado; no necesita contraseña ni IDs en variables.
También puede usarse el flag interactivo directamente con `npm run e2e:s4` para setup + cinco escenarios habilitados en la misma invocación.
`npm run e2e:s4:list` descubre un setup y seis escenarios, uno declarado pendiente.

## Privacidad y runner histórico

S3 permanece intacto: `auth.setup.ts`, `support/env.ts`, `playwright.config.ts`, sus specs, scripts existentes y workflow manual no cambiaron.
Se comparten solo helpers sin obligaciones nuevas para S3, DTOs de producto, device y política de artefactos.
Un worker, retries=0, no mocks/interceptores/offline en E2E real. Trace/screenshot/video off, reporter list.
Tokens solo dentro de navegador; signed URLs solo en memoria; archivos de sesión ignorados. Páginas sensibles se limpian/cierra contexto antes de finalizar.
Errores reemplazados por mensajes fijos; adjuntos media contienen rutas con IDs enmascarados, orden, estados y booleanos.

## Comprobación histórica de la adaptación (2026-10-12) y entorno real

- Typecheck PASS; lint PASS, cero warnings; `git diff --check` PASS.
- Producto: 1315/1315, 48 archivos PASS. Build PASS; aviso previo de chunk 644.12 kB.
- Harness: 229/229, 13 archivos PASS. Incluye rechazo de producción/sandbox inválido, exclusión de variables S3, sesiones vencidas/token ausente/revocación, membership/context inconsistente, múltiples talleres, preservación del state S3 y permisos de archivos, aborto ante API 503 y cadena CRM sin IDs fabricados.
- También conserva pruebas Chromium de OPTIONS/PUT/Range y fixtures, expiración y artefactos sanitizados. Son servidores locales sintéticos sin credenciales reales; no prueban servicios externos.
- Discovery actual: un setup y seis escenarios. Preflight real normal y `--no-deps`: exit 1 antes de tests por manifest ausente, sin exigir variables S3.
- Health/live y ready actuales: `ECONNREFUSED`. Estados reales `e2e/.auth`: cero encontrados.
- R2 actual: OPTIONS unsigned PUT (`content-type,if-none-match`) y GET (`range`) responden 403 sin allow-origin. No se alteró CORS ni se emitió PUT o URL firmada.

Bloqueos restantes: API de pruebas alcanzable, declaración privada de DB/bucket sandbox, sesión Development autorizada obtenida por operador y CORS operativo. No se hicieron mutaciones de negocio ni autenticación real nueva en esta revisión.

## Handoff para Code Review independiente

Revisar el diff local contra `5f93740` y los archivos nuevos S4. Priorizar fail-closed de producción/sandbox, validación en vivo del state, vínculo /me ↔ /context ↔ selección UI, continuidad de identidad/taller, privacidad, secuencia de IDs API y el skip PENDING de S4-03.
Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e:harness`, `npm run build`, `git diff --check`.
Comprobar por separado los archivos S3 sin diff. Ninguna prueba local o discovery acredita seis escenarios reales ni Sprint 4 PASSED.

S4-F07-D ENVIRONMENT: BLOCKED


## Correcciones del review H-1 a H-6 — 2026-10-13

Estas correcciones reemplazan únicamente las afirmaciones afectadas de la preparación inicial. Se conserva el informe histórico y el documento de recuperación recibido sin cambios. No se modifican producto, backend, infraestructura, TTL, políticas de bucket ni tests/runner S3.

| Finding | Resolución | Regresión / límite de evidencia |
| --- | --- | --- |
| H-1 MEDIUM | `s4-readiness.ts` transforma solo conectividad conocida durante GET health en `S4CheckFailure` con mensaje fijo `S4 BLOCKED: API de pruebas no alcanzable`. `s4Safe` conserva BLOCKED para errores controlados explícitos; otros errores son FAIL sanitizado. HTTP no-200 y ready/body incorrecto no se reclasifican como conectividad. | Chromium/HTTP local: ECONNREFUSED real, ETIMEDOUT/timeout controlado, 503, 401, 403, JSON inválido, DB no ready y fallos funcionales. Timeout fuera de health sigue FAIL; sin cuerpos/tokens/URLs en error. |
| H-2 LOW | El collector se instala antes de selección/carga S4-01. Cuenta solicitudes PUT por URL firmada exacta en R2, completion por sesión y asociación por recepción+asset. Exige un PUT exitoso observado y exactamente una solicitud de cada etapa, incluso si un duplicado falla o no tiene respuesta. Revalida al finalizar nueva visita/playback. S4-02 elimina el contador vacío y comprueba replay y lista persistida. | Duplicados con/sin respuesta fallan. OPTIONS, capacidades/sesiones/assets/orígenes ajenos no cuentan. La evidencia serializada sigue sanitizada. Sin interceptar/falsificar HTTP real. |
| H-3 LOW | Configuración S4 definida con un único objeto: la sobrecarga `defineConfig(base, override)` concatena webServers/proyectos y conservaba el servidor histórico. S4 reemplaza efectivamente `webServer` y proyectos, con `reuseExistingServer=false` y puerto estricto. `E2E_BASE_URL` desactiva Vite local. Antes de login y antes de navegar con la cuenta, se inspecciona el módulo Vite efectivo para API, Clerk y `PROD=false`. | Discovery de la configuración efectiva; frontend externo incorrecto bloquea antes de mutaciones. AST evita que comentarios simulen evidencia de entorno. Build externo no inspeccionable queda BLOCKED, sin añadir endpoints productivos. |
| H-4 LOW | Allowlist S4 `local/development/test`, trim+lowercase. Ausente o vacío mantiene default local. Conserva `pk_test_`, HTTPS/HTTP loopback y manifest sandbox exacto. | Permitidos normalizados, production/prod/staging/desconocidos y configuración parcial. **DOC_CONFLICT**: `src/shared/config/public-env.ts` acepta `local/staging/production`; la instrucción de esta tarea gobierna solo S4. Aceptar development/test en preflight no acredita bootstrap productivo válido. Para aplicación actual se usa local. Frontend: contrato productivo intacto; backend: sin cambio. |
| H-5 LOW | Se separan API `expiresAt`, SigV4 `X-Amz-Date`+`X-Amz-Expires`, duración monotónica observada, Date de R2 vía CDP y relojes wall del navegador/runner. TTL firmado máximo 300s. Tolerancia de aserción 2000ms por precisión de un segundo SigV4/HTTP Date y milisegundos API. Espera conservadora desde recepción de headers GET exitoso, anclada a Date R2; no se usa Date.now para vigencia/caducidad. Exige segundo GET 403 de la misma capacidad y Date R2 posterior al vencimiento. | Harness con navegador/runner ±60s, proveedor ±30s y latencia 180ms. Collector sigue validando evidencia aunque se evalúe mucho después. Si storage permite GET después del vencimiento, el test falla. Date R2 ausente o desfase excesivo no produce PASS. No se modifica TTL real. |
| H-6 LOW | S4-03 conserva declaración unconditional `test.skip`, título PENDING y cuerpo sin instrucciones ejecutables. | AST de la spec + discovery real Playwright (`expectedStatus=skipped`) + fila documental exacta. Cambiar/remover skip, hacerlo condicional, sustituir por fixme o dejar solo comentario hace fallar la regresión. No se contabiliza como PASS ni se inventa segunda identidad. |

### Correspondencia con los 24 criterios del Quality Gate de Notion

Fuente: [Quality Gates — Reglas y Pruebas por Sprint, §7](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573), leído mediante Notion el 2026-10-13. La lista coincide con [snapshot local §7](frontend-relevant-gates.md#7-sprint-4--video-360--evidencias). Numeración = orden de los 24 checks. Ninguna fila declara acreditación real nueva.

**Histórica local** significa evidencia previamente acreditada con tests/unit/harness, no integración externa. **Preparado F07-D** significa recorrido habilitado o explícitamente pendiente, no ejecución. **Sintético actual** valida instrumentación/regresión contra servicios locales controlados. **Real pendiente** requiere Clerk/API/PostgreSQL/R2 aprobados. **Backend fuera** identifica garantías que este runner no acredita.

| # | Criterio §7 | Escenarios del runner | Histórica local acreditada | Preparado F07-D / sintético actual | Real pendiente / backend fuera |
| --- | --- | --- | --- | --- | --- |
| 1 | Metadata retention_class/retention_until/policy_version, deletion/purge | Ninguno | Sin acreditación en este ticket | Sin cobertura | Backend/DB fuera; pendiente de evidencia backend |
| 2 | Upload incompleto expira/purga baseline 24h | Ninguno | Sin acreditación en este ticket | Sin cobertura | Backend/worker/R2 fuera |
| 3 | Operacional 12 meses post-orden terminal y warranty +90 días | Ninguno | Sin acreditación en este ticket | Sin cobertura | Backend/retención fuera |
| 4 | Firma/PDF/evidencia default 36 meses o hold superior | Ninguno | Sin acreditación en este ticket | Sin cobertura | Backend/política fuera |
| 5 | Legal hold evita purge automático | Ninguno | Sin acreditación en este ticket | Sin cobertura | Backend/worker fuera |
| 6 | deleted_at bloquea nuevas signed URLs antes de purged_at | Ninguno | Sin acreditación backend en este ticket | Sin cobertura | Backend/control de acceso fuera |
| 7 | Worker no borra vínculos/hold; audit event | Ninguno | Sin acreditación en este ticket | Sin cobertura | Backend/worker/auditoría fuera |
| 8 | Scan R2 faltante y huérfano sin metadata | Ninguno | Sin acreditación en este ticket | Sin cobertura | Backend/reconciliación fuera |
| 9 | Upload session | S4-01, S4-05 | F01/F07-A/B/C: cliente/adapter local | Cadena contextual preparada; collector sintético | API/DB/R2 reales pendientes |
| 10 | URL firmada temporal | S4-01, S4-06 | F01/F07-C: parsing y descarga local | Firma/TTL/correlación preparada; sintético actual | Emisión y storage reales pendientes |
| 11 | Video cliente → R2 directo | S4-01 | F01/F03/F07-B/C local | PUT/Range/playback preparado; collector Chromium sintético | Transporte R2 real pendiente |
| 12 | Fotos | S4-01, S4-04 | F02/F05/F07-B/C local | Selección/decode/carga preparada; fixtures Chromium sintéticos | Foto real contra servicios pendientes |
| 13 | Reintento | S4-02 (solo replay asociación); S4-01 (no duplicación exitosa) | F04: retry/recovery local | Replay asociación preparado; regresión duplicados sintética. No ejercita retry de PUT | Retry upload real no cubierto por seis escenarios |
| 14 | Upload interrumpido | Ninguno | F04: cancel/interruption local | Sin escenario de interrupción real | Integración pendiente, fuera del recorrido actual |
| 15 | Archivo inválido rechazado | S4-04, S4-05 | F01/F02/F03/F05 local | Negativas UI y API preparadas | MIME/tamaño server-side real pendiente |
| 16 | Metadata persistida | S4-01, S4-02 | F07-B/C: asociación/lista local | Nueva visita/lista persistida y replay preparados; collector sintético | Persistencia API/DB real pendiente |
| 17 | Checksum/tamaño cuando aplique | S4-01, S4-05 | F01: complete/tamaño local | Tamaño confirmado/negativo preparado; collector sintético. No calcula checksum opcional | Validación storage/backend y checksum aplicable pendientes |
| 18 | Enlaces específicos por dominio | S4-01, S4-02 (recepción) | F07-A/B/C: contrato/adapter local | Asociación de recepción preparada | FKs/atomicidad/auditoría backend fuera; daño/otros dominios sin recorrido |
| 19 | Sin media_links polimórfico en escritura | S4-01/02 consumen ruta canónica, evidencia parcial | Adapter F07-A/B local | Solo contrato HTTP específico; no acredita esquema | Backend/DB fuera |
| 20 | Media A no enlaza entidad B | S4-03 PENDING | Historia S3 no acredita media S4 | Declaración skip protegida; no ejecutable | Aislamiento/RBAC real PENDING; backend/DB fuera |
| 21 | URL de descarga expira | S4-06 | F07-C/harness inicial: simulación local | GET200→espera efectiva→misma capacidad403 preparado; desfase/latencia sintéticos | Caducidad R2 real pendiente |
| 22 | R2 caído no destruye recepción | Ninguno; S4-04 solo archivo inválido | F05/F07-B/C: errores media conservan recepción local | Sin escenario de outage real; S4-04 no lo sustituye | Integración outage pendiente |
| 23 | Consulta/vista media por orden | Ninguno; S4-01 es por recepción | Galería F07-C por recepción no acredita orden | Fuera del runner actual | Contrato/feature por orden pendientes |
| 24 | E2E recepción + video + fotos | S4-01 | Componentes/harness F07-B/C locales | Recorrido íntegro preparado; collector/fixtures sintéticos | E2E real BLOCKED / no ejecutado |

Referencias históricas: [F01](s4-f01-media-client-verification.md), [F04](s4-f04-upload-recovery-verification.md), [F05](s4-f05-reception-media-verification.md), [F07-C gate](s4-f07-c-media-final-gate.md). Los resultados históricos permanecen en esos informes; no se vuelven resultados reales por esta matriz. Estado global: **NOT_READY**.

### Gates de los fixes y re-review

Gates ejecutados secuencialmente con Node **22.23.3** (pin 22, engines >=22.22.2 <23). `npm ci` instaló el lockfile existente; no se añadieron dependencias ni se cambió el lockfile.

| Gate final | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 warnings |
| `npm test` | PASS, 1315/1315, 48 archivos |
| `npm run test:e2e:harness` | PASS, 273/273, 14 archivos; 44 casos adicionales frente a la adaptación histórica 229/229 |
| `npm run build` | PASS; aviso previo de chunk 644.12 kB (>500 kB), sin aumentar límites |
| `git diff --check` | PASS |
| `npm run e2e:s4:list` | PASS: 1 setup + S4-01 a S4-06; S4-03 esperado skipped/PENDING |
| Preflight con entorno vacío, normal y `--no-deps` | exit 1, BLOCKED antes de tests/webServer/login; sin exigir variables S3 |
| Verificación de frontend efectivo con Vite real local | PASS con configuración pública sintética; sin llamadas de negocio/auth/storage |

El primer lint detectó tres expresiones void en tests; se corrigieron. La regresión inicial de H-3 falló al detectar la concatenación real de servidores de Playwright; se corrigió la definición a un único objeto. Las suites finales pasan sin aumentar timeouts.

El preflight actual de este worktree confirma ausencia de `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `E2E_S4_R2_ORIGIN` y `E2E_S4_SANDBOX_FILE`; `.env` del worktree ausente y cero estados privados JSON regulares. La configuración pública principal ya localizada históricamente puede inyectarse por el loader S4; no se copió ni imprimió. No se reejecutaron probes autenticados ni endpoints reales de API/R2 en esta corrección. Pendientes: inyectar configuración pública, declaración sandbox real, API/DB accesibles, una sesión Development autorizada y CORS/storage real. S4-03 sigue PENDING con identidades distintas fuera de los cinco casos habilitados.

Re-review pendiente de un revisor independiente; esta tarea prepara su diff y evidencia, no afirma haber realizado revisión independiente.

Revisar adaptación + fixes contra base `5f93740684ae47c481f58e5604f7ec81bc4ba910`. El SHA del commit local y git status se entregan al cierre. Revisar especialmente clasificación de infraestructura, contadores instalados antes de operación, configuración efectiva S4, fail-closed del frontend externo, tiempos API/firma/R2 y skip PENDING. S3 y producción sin diff.


### Archivos incluidos en la entrega local

Base/HEAD recibido: `5f93740684ae47c481f58e5604f7ec81bc4ba910`. Rama: `task/s4-f07-d-real-media-e2e`. Son 23 archivos: 10 modificados respecto de HEAD y 13 nuevos. Se conservan e incluyen los seis modificados y ocho untracked recibidos; el registro histórico de recuperación permanece idéntico.

- `docs/quality/s4-f07-d-environment-recovery.md`
- `docs/quality/s4-f07-d-real-media-e2e.md`
- `e2e-harness-tests/unit/s4-auth.test.ts`
- `e2e-harness-tests/unit/s4-media.test.ts`
- `e2e-harness-tests/unit/s4-review-regressions.test.ts`
- `e2e/s4-media.spec.ts`
- `e2e/s4.env.example`
- `e2e/s4.setup.ts`
- `e2e/support/s4-check.ts`
- `e2e/support/s4-context.ts`
- `e2e/support/s4-download-expiry.ts`
- `e2e/support/s4-download-timing.ts`
- `e2e/support/s4-environment.ts`
- `e2e/support/s4-fixtures.ts`
- `e2e/support/s4-frontend.ts`
- `e2e/support/s4-media-evidence.ts`
- `e2e/support/s4-preflight.ts`
- `e2e/support/s4-readiness.ts`
- `e2e/support/s4-safe.ts`
- `e2e/support/s4-session-paths.ts`
- `e2e/support/s4-session.ts`
- `package.json`
- `playwright.s4.config.ts`

Runner/specs/helpers históricos S3, scripts previos, producto `src/`, workflow y lockfile sin cambios respecto de la base. No push ni PR. Commit local con alcance adaptación S4 + H-1–H-6; SHA y git status entregados al cierre.

S4 REAL E2E: BLOCKED

S4-F07-D FIXES: READY_FOR_RE_REVIEW


## Corrección residual N-1 / N-2 — 2026-10-13

HEAD recibido para esta corrección: `c2e1a0787a6d71303ffc139bb9641a0c7c13b0f6`; base histórica/incremental de la adaptación: `5f93740684ae47c481f58e5604f7ec81bc4ba910`. Rama y worktree sin cambios. La nueva entrega será un único commit local adicional sobre c2e1a07, sin amend, push ni PR. Los registros anteriores, la matriz de 24 criterios y el documento de recuperación se conservan como historia de la primera entrega.

### Adjudicación independiente recibida

Según la solicitud del propietario: H-3/H-4/H-5/H-6 CLOSED; correcciones principales H-1/H-2 verificadas con residuales LOW N-1/N-2. Sin defectos críticos/HIGH ni filtraciones de secretos; producto 1315/1315 y harness 273/273 acreditados en ese re-review. Esa adjudicación no fue realizada por el implementador de esta corrección y no acredita E2E reales.

### N-1 — bootstrap funcional rotulado BLOCKED

**Causa:** las aserciones de `/me`, `/me/context` y selección UI empleaban el prefijo BLOCKED, y `s4Safe` lo usaba como clasificación. También se trataba la pérdida de permisos/membership durante el escenario como una precondición inicial ausente.

**Corrección:** `S4CheckFailure` admite clasificación explícita FAIL/BLOCKED. `s4Safe` prioriza ese dato y expone la misma clasificación en su error público sanitizado. La compatibilidad por prefijo permanece únicamente para los checks históricos que no declaran clasificación, preservando health, frontend y sandbox cerrados. No se cambia la configuración/preflight, transporte S3, DTOs ni rutas.

`resolveS4Context` separa fase `precondition` del setup (predeterminada, usada por la validación de estados) y fase `scenario`, usada por `openS4App`. En setup, ausencia de sesión/membership/permisos elegibles produce `S4SessionUnavailable` BLOCKED con justificación y permite evaluar otro estado guardado. Una vez iniciado el recorrido, perder sesión/membership/permisos produce FAIL. HTTP 503 u otro HTTP incorrecto, contrato/JSON inválido, identidad/tenant/membership inconsistente y selección UI no confirmada producen FAIL explícito. Errores browser-fetch/CORS/token sin prueba de infraestructura caída son FAIL sanitizado; no se presume que todo error de red sea un bloqueo. La conectividad conocida en health sigue siendo BLOCKED.

**Pruebas agregadas:** HTTP y Chromium locales sintéticos verifican `/me` 503 y contrato inválido, `/context` 503/JSON inválido e inconsistencia de user/tenant/membership, UI no confirmada/JSON inválido/selección ambigua, pérdida de sesión/membership/permisos y contexto 401/403 después de bootstrap válido, y fallo de transporte no demostrado como outage. Se comprueba clasificación interna y pública en la misma ejecución, limpieza about:blank y ausencia del marcador sensible en errores. Precondición ausente antes de escenario conserva BLOCKED; health con ECONNREFUSED real local conserva BLOCKED. Configuración/sandbox ausentes bloquean el CLI real de Playwright antes de ejecutar tests.

Un control adicional usa el CLI/reporter JSON real de Playwright contra proveedores HTTP **sintéticos locales**: bootstrap 503 se reporta FAIL, health inaccesible y membership inicial ausente se reportan BLOCKED. Los tres tests deliberadamente negativos terminan failed, con `expected=0`, `unexpected=3`, exit 1 y cero PASS; el harness exige ese resultado. No es una corrida E2E real de TallerMecario.

**Limitaciones:** las precondiciones se validan exclusivamente antes de los escenarios; el flag de fase no concede permisos ni sustituye `/me`/`/context`. La prueba local no demuestra autorización/servicios desplegados. La compatibilidad legacy no transforma respuestas funcionales N-1 en bloqueo.

### N-2 — nueva sesión/capacidad ocultaba upload duplicado

**Causa:** la cadena exigía un único PUT por cada capacidad esperada, pero una sesión extra con IDs/URL nuevos podía quedar fuera de esas correlaciones.

**Corrección:** collector instalado desde el comienzo de S4-01 y checkpoint de operación inmediatamente antes del primer click de subida, una vez obtenido el ID de recepción real. Se registran secuencias de solicitudes y se llevan a las respuestas; el checkpoint descarta requests anteriores aunque su respuesta llegue tarde. La operación exige exactamente dos POST upload-session para esa recepción y exactamente dos PUT a R2. Se conservan los requisitos de PUT exitoso observado, un PUT por capacidad, un completion por sesión, una asociación por asset, headers/CORS y vínculos de identidad/tamaño. Se revalida al confirmar uploads y al finalizar nueva visita/playback.

No cuenta OPTIONS ni tráfico de otros orígenes. Las capacidades conocidas de otras recepciones/corridas se excluyen. Un PUT desconocido dentro de la ventana del recorrido falla conservadoramente por conteo/correlación: no se puede atribuir a otra corrida sin evidencia. El navegador de S4-01 es aislado y no comparte requests con otras páginas/workers. URLs y bodies solo quedan en memoria privada; la serialización conserva rutas enmascaradas, estados y booleanos. S4-02 mantiene replay idempotente de asociación sin cambios.

**Pruebas agregadas:** positiva de dos archivos; tercera sesión con nuevos IDs y flujo completo; tercer PUT con capacidad diferente; sesión extra sin PUT; request extra de create sin respuesta; PUT duplicado; PUT esperado ausente; completion/attach duplicado; requests anteriores con respuestas tardías; otra recepción/capacidad conocida, OPTIONS y otro origen excluidos. La operación debe delimitarse antes de afirmar su éxito. Se comprueba ausencia de capacidades/IDs/credenciales en el reporte serializado.

**Limitaciones:** se observa la operación exitosa delimitada, no reintentos/interrupciones ni retención backend. Las aserciones no falsifican ni interceptan HTTP del runner real; los dobles están solo en el harness sintético.

### Resultado y decisión residual

Implementación y regresiones residuales verificadas localmente. La decisión de cierre de N-1/N-2 corresponde al próximo re-review independiente; no se auto-adjudican CLOSED.

Gates ejecutados secuencialmente con Node 22.23.3:

| Gate residual | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 warnings |
| `npm test` | PASS final: 1315/1315, 48 archivos |
| `npm run test:e2e:harness` | PASS: 305/305, 15 archivos; 32 regresiones nuevas frente a 273/273 |
| `npm run build` | PASS; aviso previo de chunk 644.12 kB, sin cambiar límites |
| `git diff --check` | PASS |
| `npm run e2e:s4:list` | PASS: 1 setup + seis escenarios; cinco habilitados y S4-03 PENDING/expected skipped |
| Preflight vacío normal / `--no-deps` | exit 1/BLOCKED, sin tests iniciados ni variables S3 requeridas |
| Invariantes H-3/H-4/H-5/H-6 y S3/producto | Sin diff en los archivos cerrados/excluidos; sus regresiones conservadas pasan |

El primer lint señaló tres interpolaciones numéricas de fixtures sintéticos; se corrigieron usando String, sin cambiar aserciones. La primera suite de producto dio **1314/1315** por espera de alerta en `download HTTP 403 shows safe error, no URL or unsafe request reference` de galería. La comprobación aislada pasó **44/44** y la repetición completa pasó **1315/1315**. Producto y timeouts permanecen intactos. La causa de esa intermitencia no se ha demostrado; se registra como riesgo a seguir, sin convertir el fallo inicial en PASS.

Preflight actual: ausentes `VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `E2E_S4_R2_ORIGIN` y `E2E_S4_SANDBOX_FILE`; cero estados privados JSON regulares. No se ejecutaron pruebas ni probes contra Clerk/API/DB/R2 reales. Pendientes: configuración inyectada, declaración sandbox, una sesión Development autorizada y verificación de servicios/CORS. No se solicitan tres cuentas ni IDs S3 históricos.

Se preservan **cinco escenarios preparados**, **S4-03 PENDING/skip (jamás PASS)**, **E2E reales no ejecutados** y **Sprint 4 NOT_READY**. **Staging y QA reales siguen pendientes** conforme a [Notion Quality Gates §22](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573) y su [snapshot §22](frontend-relevant-gates.md#22-flujo-obligatorio-de-sprint): Code Review → Unit/Integration/E2E → Staging → QA → Quality Gate. Los gates locales no son aprobación global ni habilitan el siguiente Sprint.

Archivos del diff residual: `e2e/support/s4-check.ts`, `e2e/support/s4-safe.ts`, `e2e/support/s4-context.ts`, `e2e/support/s4-media-evidence.ts`, `e2e/s4-media.spec.ts`, nuevo `e2e-harness-tests/unit/s4-residual.test.ts`, y este informe. H-3/H-4/H-5/H-6, S3, src, backend, lockfile, config y scripts sin cambio. Re-review: comparar c2e1a07 contra el SHA nuevo informado al cierre, priorizando clasificación por fase y conteos globales con IDs/capacidades nuevos.


S4 REAL E2E: BLOCKED

S4-F07-D RESIDUAL FIXES: READY_FOR_RE_REVIEW


## Corrección final R-1 / R-2 — 2026-10-13, America/Bogota

Base de esta entrega: `3480bc4c93fe94251c6ea699f5064c6a9588ba68`; rama/worktree S4-F07-D existentes. Un único commit local adicional, sin amend/push/PR. El historial anterior permanece íntegro como prefijo del informe; las conclusiones de cada revisión conservan su fecha y alcance.

Adjudicación recibida del re-review independiente: H-1–H-6 y N-1/N-2 corregidos en sus objetivos principales; nuevos residuos R-1/R-2 LOW; producto 1315/1315, harness 305/305; E2E real no ejecutado. La decisión independiente final sigue pendiente.

### R-1: exclusiones ocultaban operaciones posteriores al checkpoint

**Causa:** el total de creates filtraba `receptionId` y `foreignCapabilities` excluía PUT de otras recepciones, aunque ambos comenzaran durante S4-01.

**Corrección:** desde `beginUploadOperation`, se cuentan todos los POST upload-session en el API y todos los PUT al origen R2 autorizado, sin filtros de recepción/asset/capacidad. Totales exactos: dos creates, dos PUT, dos completion y dos asociaciones. A esos totales se suman las correlaciones existentes: un PUT exitoso y headers firmados exactos por capacidad esperada, un complete active por sesión/asset/tamaño y una asociación a la recepción esperada por asset. Una operación extra con ID nuevo o contexto distinto falla. Las rutas de complete/attach no excluyen IDs inesperados, malformados o con mayúsculas.

La única exclusión temporal conserva solicitudes **iniciadas antes del checkpoint** mediante `requestSeq`, incluso si su respuesta se recibe después. OPTIONS no es PUT; otros métodos/orígenes/rutas ajenos al contrato no son operaciones relevantes. Los hashes de capacidades y rutas de objeto sustituyen las URLs firmadas en la memoria del collector; se proyectan los DTOs necesarios y se hashean los valores de headers firmados. Los datos firmados se leen transitoriamente para parsear/correlacionar, pero no se retienen en arrays/maps ni se publican. CDP OPTIONS conserva únicamente origen/path sin query y los headers técnicos necesarios. La validación de origen/tiempos de descarga permanece explícita; no cambia TTL ni expiración S4-06.

**Regresiones:** dos archivos correctos; tercera sesión propia/ajena, con y sin PUT; tercer PUT con capacidad nueva o de otra recepción; PUT posterior de capacidad ajena emitida antes del checkpoint; complete/attach extra con IDs distintos; IDs malformados/mayúsculas; correlación errónea; solicitudes anteriores con respuestas tardías; OPTIONS; reporte sanitizado. Se actualiza la antigua prueba N-2 que aceptaba tráfico ajeno posterior, conservando su comprobación de requests anteriores. Fixtures compartidos solo dentro del harness.

**Mutaciones:** seis variantes temporales fuera del repositorio relajan totales create/PUT/complete/attach o restauran filtros de recepción/PUT ajeno. El control exige que la implementación actual rechace cada negativo y que el mutante lo acepte (fallaría la regresión), además de exigir que el happy path continúe válido en cada mutante. Se detectan 6/6 mutaciones; no son pruebas contra servicios reales.

### R-2: cold start sin setup se clasificaba como revocación

**Causa:** `openS4App` usaba fase activa desde el primer `beforeEach`, y la fixture Page podía fallar leyendo un estado ausente antes de que el hook lo clasificara.

**Corrección:** `S4ScenarioSession` inicia explícitamente en precondition y solo cambia a scenario después de verificar Clerk, `/me`, `/context`, permisos y selección UI. Conserva identidad/taller/membership para todo el recorrido, incluida la nueva visita dentro de S4-01. La ausencia/expiración inicial es BLOCKED; después de validar, pérdida de sesión/membership/permisos o cambio inesperado de identidad/taller es FAIL. HTTP 503 y contratos inconsistentes son FAIL en ambas fases. No se deduce fase mediante mensajes.

Un `beforeAll` sin Page verifica el archivo canónico antes de que Playwright intente hidratar `storageState`, con setup y `--no-deps`. Falta de archivo, JSON incompatible, archivo/directorio enlazado o directorio inválido producen BLOCKED sanitizado. No certifica una sesión por existencia del archivo: la validación viva del `beforeEach` sigue obligatoria. No se modifica la configuración ni se exigen cuentas/IDs S3.

### Auditoría de casos vecinos

| Punto inspeccionado | Decisión / evidencia |
| --- | --- |
| Filtros de creates/PUT/completion/attach posteriores | Sin exclusiones por recepción ni capacidad. Totales y correlación fallan ante extras. |
| Rutas con IDs distintos/malformados/mayúsculas | Ampliado el reconocimiento de operaciones relevantes para impedir exclusión por patrón UUID; no se cambian endpoints reales. |
| Correlación de respuesta tardía | Se conserva secuencia del inicio request; prueba positiva con response posterior al checkpoint. |
| StorageState ausente/incompatible/enlazado antes de Page | Guard previo beforeAll y error público sanitizado; reporter lo verifica con/sin deps. |
| Directorio de candidates no regular | `s4StateCandidates` lo rechaza como precondición inicial, de forma coherente con el guard de beforeAll. |
| Clerk.load inesperado y fallo de getToken | Loader compartido conserva 30s, reemplaza errores por FAIL fijo; getter que lanza y token rechazado se prueban en setup y no-deps. No se interpretan como ausencia de identidad. |
| Sesión/membership/permisos ausentes al inicio | BLOCKED con justificación; phase permanece precondition. |
| Revocación o identidad/contexto diferente una vez verificado | FAIL; no hay fallback a otra identidad durante el escenario. Prueba también cambio API consistente entre /me y /context. |
| Bootstrap/context HTTP y DTO inválidos | Clasificación explícita FAIL conservada de N-1. |
| Health con conectividad conocida | BLOCKED controlado conservado; no se generaliza a cualquier excepción o 503. |
| Preflight/frontend/orígenes/Clerk Development | Guardas cerradas conservadas. No se alteran H-3/H-4/H-5/H-6 ni S3. |
| Persistencia/navegación inesperada de setup | Error genérico no se reclasifica automáticamente como identidad ausente; FAIL sanitizado. Checks explícitos de entorno/archivo inseguro mantienen BLOCKED. |
| Expiración y almacenamiento de capacidades | Hashes en collector; URL efectiva solo en la operación browser existente. Helpers S4-06 y TTL reales intactos. |

Los controles R-2 toman los hooks efectivos de la spec y los ejecutan mediante el CLI/reporter JSON de Playwright contra HTTP/Clerk **sintéticos locales**. Solo se reubican imports y el archivo de estado dentro del directorio temporal; no se interceptan requests del runner real. Configuración de proyecto con dependencia setup o `--no-deps`, storageState real de Playwright, trace/screenshot/video off. Positiva de sesión inicial válida; negativas de archivo ausente/vencido/incompatible/enlazado, autenticación inicial incompleta, revocación durante S4-01, membership/tenant/permisos distintos, cambio de identidad consistente en API, 503, health inaccesible, getter Clerk que lanza y token que rechaza. El reporter debe dar FAIL/BLOCKED correcto y ningún escenario negativo puede terminar passed. No equivalen a una corrida multimedia real.

### Intermitencia preexistente de galería — riesgo separado

- **Main `9052f26`:** reproducción confirmada por el re-review independiente y comunicada en la solicitud R-1/R-2. No se inventan logs ni cantidades no proporcionadas por ese revisor. Control adicional ejecutado en esta sesión sobre `9052f263daaf233508ba5625e86b42c96cefd6bd`: `npm test` PASS 1315/1315, 48 archivos; este intento no reprodujo el fallo y no invalida la observación intermitente previa.
- **Rama:** evidencia N-1/N-2 conservada arriba: primera corrida con timeout HTTP403, 1314/1315; galería aislada 44/44 y repetición 1315/1315. En esta entrega R-1/R-2, la primera corrida volvió a fallar: `rejects already expired URL and only reacquires upon another user action`, espera de `/El acceso temporal expiró/`, 1314/1315. Galería aislada posterior 44/44; repetición completa 1315/1315.
- **Producción idéntica:** `git diff 3480bc4 -- src` y comparación `9052f26` ↔ rama para `src/` sin diferencias. No se modifican `src/`, tests de producto, timeouts ni estrategia de ejecución para conseguir PASS.
- **Causa no demostrada.** Recomendada investigación independiente de la intermitencia de galería; no atribuirla a R-1/R-2 ni asumir resuelta por una repetición exitosa. Se mantienen todas las incidencias y repeticiones, sin convertir la primera corrida en PASS.

### Gates finales y entrega

Gates ejecutados secuencialmente con Node 22.23.3:

| Gate final | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 warnings |
| `npm test` | Primera corrida 1314/1315 por galería; aislada 44/44; repetición completa PASS 1315/1315, 48 archivos. Incidencia conservada arriba. |
| `npm run test:e2e:harness` | PASS 356/356, 16 archivos; 51 regresiones nuevas (17 R-1 y 34 controles reporter R-2), incluyendo detección de 6/6 mutaciones. |
| `npm run build` | PASS; aviso existente de chunk 644.12 kB, sin cambiar límites. |
| `git diff --check` | PASS |
| `npm run e2e:s4:list` | PASS: 1 setup + S4-01 a S4-06; cinco habilitados, S4-03 PENDING/expected skipped. |
| Preflight vacío normal / `--no-deps` | exit 1/BLOCKED en ambos; sin tests iniciados ni variables S3 requeridas. |
| Producto, S3, H-3/H-4/H-5/H-6, config, scripts, lockfile | Sin diff en archivos excluidos; regresiones históricas conservadas pasan. |
| Main | HEAD `9052f263daaf233508ba5625e86b42c96cefd6bd`, limpio e intacto. |

La inspección del preflight efectivo confirma cuatro variables ausentes (`VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `E2E_S4_R2_ORIGIN`, `E2E_S4_SANDBOX_FILE`) y cero estados privados regulares. No se ejecutaron pruebas/probes contra Clerk/API/DB/R2 reales. Pendientes: entorno inyectado, declaración sandbox acreditada, sesión Development autorizada y servicios/CORS reales.

Archivos del commit final: `e2e/support/s4-media-evidence.ts`, `e2e/support/s4-context.ts`, `e2e/support/s4-session.ts`, `e2e/support/s4-safe.ts`, `e2e/s4-media.spec.ts`, `e2e-harness-tests/unit/s4-residual.test.ts`, nuevos `e2e-harness-tests/helpers/s4-upload-fixture.ts` y `e2e-harness-tests/unit/s4-final.test.ts`, y este informe. Único commit local adicional sobre `3480bc4`; SHA y estado Git entregados al cierre. Sin amend, push ni PR.

Cinco escenarios preparados, S4-03 PENDING/skip y jamás PASS, E2E reales BLOCKED/no ejecutados, Sprint 4 NOT_READY. Staging y QA reales pendientes conforme a [Notion Quality Gates §22](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573) y su snapshot: Code Review → Unit/Integration/E2E → Staging → QA → Quality Gate. Re-review independiente final pendiente; esta entrega no lo sustituye ni habilita el siguiente Sprint.

S4 REAL E2E: BLOCKED

S4-F07-D FINAL FIXES: READY_FOR_RE_REVIEW

## Cierre de Code Review independiente y auditoría documental

Esta sección es el **estado vigente** del ticket y prevalece sobre cualquier estado anterior del documento. Los estados `READY_FOR_RE_REVIEW` (incluido el cierre de la corrección final R-1 / R-2) se conservan íntegros como registro histórico de cada entrega, pero **ya no representan el estado vigente**: el re-review independiente final que figuraba como pendiente fue completado y aprobado.

### Revisión

| Concepto | Registro |
| --- | --- |
| Commit técnico auditado | `cf4de4070cab842d08a4eb62f2b6161200fc5274` |
| Re-review independiente final | `S4-F07-D FINAL RE-REVIEW: NO FINDINGS` |
| Revisor | Codex |
| Auditoría documental | Finding único D-1 (P2): el documento mostraba el re-review final como pendiente. Corregido por esta sección; sin findings de código nuevos. |

### Findings cerrados

| Findings | Estado |
| --- | --- |
| H-1 a H-6 | CLOSED |
| N-1 y N-2 | CLOSED |
| R-1 y R-2 | CLOSED |

Los diez findings figuran CLOSED. No hay findings de código abiertos.

### Evidencia verificada por Codex en el re-review

- Producto: 1315/1315 PASS.
- Harness: 356/356 PASS.
- Typecheck, lint y build: PASS.
- Discovery: cinco escenarios habilitados y S4-03 PENDING.
- Preflight vacío: BLOCKED.
- Worktree limpio durante el re-review.

Estos resultados corresponden a las ejecuciones ya registradas arriba y a la verificación del revisor; este cierre documental **no** vuelve a ejecutar las 1315 pruebas de producto ni las 356 del harness y no los presenta como una nueva corrida.

### Decisiones de aceptación separadas

| Decisión | Estado | Alcance |
| --- | --- | --- |
| A. Aceptación técnica del runner | `ACCEPTED_FOR_INCREMENTAL_PR` | El código y sus pruebas sintéticas tienen revisión independiente aprobada. |
| B. Aceptación funcional E2E | `BLOCKED` | Los cinco escenarios reales no han sido ejecutados contra el entorno integrado. S4-03 continúa PENDING porque requiere identidades adicionales para demostrar aislamiento multimedia. |
| C. Quality Gate global | `SPRINT 4: NOT_READY` | El PR del runner no equivale a certificar multimedia real ni a cerrar el Sprint 4. |

### Limitaciones pendientes (no son findings del código F07-D)

- API/DB de pruebas operativas.
- Sandbox privado acreditado.
- Una única sesión autorizada en Clerk Development.
- Verificación R2/CORS mediante capacidades firmadas reales.
- E2E reales de los cinco escenarios.
- S4-03 PENDING.
- Retry/upload interrumpido/outage R2.
- Consulta multimedia por orden.
- Evidencia backend restante.
- Staging y QA.
- Intermitencia preexistente de galería F07-C (riesgo separado, causa no demostrada; documentado arriba).

### Estado vigente

- F07-D (runner y pruebas sintéticas): apto para PR incremental.
- E2E reales: BLOCKED / no ejecutados.
- Sprint 4: NOT_READY.

S4-F07-D FINAL RE-REVIEW: NO FINDINGS

S4 REAL E2E: BLOCKED

SPRINT 4: NOT_READY


## Corrección del harness CI del PR #24 — 2026-10-15

Solicitud: corregir el fallo sintético en [CI 38763827418](https://github.com/IvanBy12/TallerMecario/actions/runs/38763827418), sobre `978e3efad907b88a5d47ffb5baf3306d9531f895`. El log remoto confirma 355/356 y la aserción del primer GET. No conserva su estado HTTP ni el instante de entrega CDP; no permite atribuir ese fallo concreto exclusivamente a una de las hipótesis.

### Diagnóstico reproducido y corrección

- Baseline macOS/Node 22.23.3: archivo afectado 53/53 PASS. Un éxito local no descarta intermitencia Linux.
- Carrera demostrada con el helper original: demorar exclusivamente la entrega nativa de `Network.responseReceivedExtraInfo` 100 ms deja `initialStatus=200` y cero eventos correlacionados cuando vuelve `page.evaluate`. La latencia API observada fue 185.9 ms; reproduce la misma aserción de CI sin modificar HTTP.
- Ventana sintética insuficiente demostrada por separado: con TTL original de 2 s y latencia controlada de 2100 ms, el servidor recibió el primer GET con `remainingMs=-582` y lo denegó. La precisión de segundos enteros deja entre 1 y 2 s antes de descontar latencia y planificación. Esto demuestra fragilidad bajo carga; no prueba que fuera la causa del caso remoto con latencia nominal de 180 ms.
- `s4-download-expiry.ts` espera explícitamente los eventos correlacionados por SHA-256 de la URL completa y `requestId`: uno para el GET inicial y exactamente dos para la comprobación final. Cada espera termina por condición, con límite local de 5 s para evidencia ausente. Conserva HTTP 200 inicial, HTTP 403 final y Date de storage posterior al vencimiento. Admite ExtraInfo antes del evento de solicitud y rechaza IDs/eventos duplicados; revalida al reanudar tras la notificación.
- Solo el proveedor HTTP sintético cambia TTL de 2 a 5 s, coherente en firma, DTO y vencimiento efectivo del servidor. La regresión de latencia 2100 ms conserva una ventana inicial y vuelve a solicitar la misma capacidad después de su caducidad. TTL/políticas reales, tolerancia temporal y timeouts globales permanecen intactos.
- La instrumentación temporal solo imprimió números/booleanos y fue retirada. Las regresiones perturban exclusivamente la entrega CDP; los estados HTTP proceden del servidor local. Sin nuevas dependencias, retries, skips ni cambios de producto/backend/S3.

### Verificación de esta corrección

Archivo afectado: 61/61 PASS. Incluye los tres casos previos, latencia 2100 ms, ExtraInfo antes de requestWillBeSent, evidencia inicial/final ausente, respuesta inicial/final duplicada, solicitud duplicada y otra capacidad. `denyExpired: false` continúa rechazado por falta de HTTP 403 real; un error CORS no sustituye evidencia. Continúan las comprobaciones existentes de sanitización, secretos sintéticos y preflight fail-closed.

Node 22.23.3, macOS. Comandos ejecutados secuencialmente sobre el mismo código:

| Verificación | Resultado |
| --- | --- |
| Archivo `s4-media.test.ts` completo | PASS, 61/61 |
| Diez repeticiones con `-t "observes native HTTP and effective expiry"` | PASS, 10/10 corridas, 4/4 casos por corrida (40/40); 29.69–31.07 s por corrida |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 warnings |
| `npm test` | PASS, 1315/1315, 48 archivos |
| `npm run test:e2e:harness` | PASS, 364/364, 16 archivos, 70.04 s |
| `npm run build` | PASS; aviso previo del chunk de 644.12 kB (>500 kB) |
| `git diff --check` | PASS |

Los negativos nuevos y existentes pasan porque la verificación rechaza los casos inválidos. El filtro `-t` solo selecciona los cuatro casos de expiración en cada repetición; el archivo y el harness completos ejecutan también las demás regresiones. El log remoto original tiene dependency scan/gitleaks omitidos por el fallo anterior; no se ejecutaron esos scans en esta corrección local ni se declara CI Linux resuelto sin una nueva corrida remota.

### Límites preservados

No se ejecutaron pruebas reales contra Clerk, PostgreSQL ni Cloudflare R2. Los cinco E2E reales siguen bloqueados, S4-03 sigue PENDING, se conserva una sola cuenta y las guardas de producción/preflight. El historial H-1–R-2 no se reabre. La validación macOS debe contrastarse con una nueva corrida GitHub Actions Linux después del push manual del propietario. No se hace push, creación de PR ni merge en esta tarea.

S4-F07-D CI FIX: READY_FOR_REVIEW

S4 REAL E2E: BLOCKED

SPRINT 4: NOT_READY


## Corrección de inyección CDP no determinista en Linux CI — 2026-10-17

Solicitud del propietario sobre PR #24 y HEAD `da6c42e4e37e1134c91686bfccd3c65eb181406c`, rama `task/s4-f07-d-real-media-e2e`, worktree obligatorio existente. Solo se modifica el fixture de `e2e-harness-tests/unit/s4-media.test.ts` y este addendum. El helper real `e2e/support/s4-download-expiry.ts` permanece intacto tras comprobar sus guardas. Sin cambios en producto/F07-C, backend, autenticación, workflows, dependencias, configuración, TTL ni timeouts.

### Incidencia y diagnóstico

Se leyó independientemente el [log de CI 38776580161](https://github.com/IvanBy12/TallerMecario/actions/runs/38776580161): harness 362/364. `duplicate-response` esperaba el rechazo del GET inicial y recibió el del GET final; `duplicate-second` aceptó `{ initialStatus: 200, expiredStorageStatus: 403, waitedPastExpiry: true }`. La solicitud registra typecheck/lint y producto 1315/1315 PASS, con build/audit/Gitleaks SKIPPED; los pasos omitidos no se convierten en PASS. Baseline macOS local del archivo: 61/61, 70.34 s; no reprodujo por sí solo la intermitencia Linux.

La inyección anterior consultaba `storageRequests.includes(requestId)` y el tamaño actual del array al llegar ExtraInfo. La identidad del evento dependía, por tanto, de otros eventos ya recibidos. Se extrajo y transpiló el callback original de `da6c42e` sin reimplementarlo y se reprodujeron dos órdenes de entrada controlados:

- ExtraInfo inicial → request inicial → request final → ExtraInfo final: en `duplicate-response`, el callback entrega una respuesta inicial y dos finales. Duplica el GET incorrecto, coherente con el primer fallo de CI.
- ExtraInfo inicial → request inicial → ExtraInfo final → request final: en `duplicate-second`, entrega una respuesta por GET. No aplica la perturbación, coherente con el segundo fallo de CI.

Este replay demuestra el defecto del fixture; usa eventos diagnósticos sintéticos, no una integración R2 ni una captura del orden exacto del CI remoto. CDP puede entregar ExtraInfo fuera de la secuencia asumida; el helper ya conservaba sus datos por requestId antes de conocer el request.

### Corrección y evidencia de inyección

El fixture reúne request y ExtraInfo nativos en un mapa por requestId antes de transformar o entregar el par. Conserva la identidad del primer GET; cada evento posterior usa la fase guardada de su propio requestId. Comprueba SHA-256 contra la capacidad emitida por el proveedor sintético, un solo request/ExtraInfo nativo por fase y HTTP 200 inicial/403 final cuando la verificación alcanza esa fase. Una llegada anticipada de ExtraInfo queda pendiente hasta conocer su request, en lugar de decidir el objetivo mediante el número de eventos presentes.

Cada uno de los seis negativos ejecuta tres variantes: request antes de ExtraInfo, ExtraInfo demorado 100 ms y ExtraInfo antes del request demorado 100 ms. Son perturbaciones de entrega CDP; ningún estado HTTP es fabricado. Se mantienen el proveedor HTTP local, Date del proveedor, TTL sintético de cinco segundos, reloj monotónico y el límite local existente de cinco segundos por condición.

El registro de perturbaciones debe contener exactamente el modo y la fase esperados; se actualiza al suprimir, modificar o duplicar efectivamente el evento entregado. El orden de los callbacks también se verifica. No basta con que la promesa rechace:

| Modo | Evento transformado y comprobado |
| --- | --- |
| `duplicate-response` | ExtraInfo del GET inicial duplicado |
| `duplicate-second` | ExtraInfo del GET final duplicado |
| `duplicate-request` | request inicial duplicado |
| `missing-first` | ExtraInfo inicial omitido |
| `missing-second` | ExtraInfo final omitido, preservando el inicial |
| `foreign-capability` | request inicial con otra capacidad |

Además, `duplicate-response` incluye, en cada orden, un duplicado inicial retenido hasta observar el segundo GET nativo. Esta entrega está entre la primera y la segunda verificación del helper, sin un sleep para adivinar la fase. El helper lo rechaza con el error final porque conserva el conjunto de duplicados y lo vuelve a comprobar. No fue necesario cambiarlo.

La primera ejecución de la corrección quedó en 60/61: una aserción del fixture exigía la entrega final demorada incluso después de que el duplicado tardío ya provocara el rechazo. Se separaron los hechos nativos recibidos de los callbacks entregados; no se relajó el rechazo ni se alteró el helper. El caso focalizado corregido pasó 1/1 (60 casos fuera de la selección), con seis recorridos Chromium, en 24.27 s. No se oculta la corrida fallida.

### Mutaciones independientes

Dos variantes del helper se ejecutaron en una copia temporal fuera del repositorio; nunca sobre el worktree revisado:

- Ignorar duplicados de ExtraInfo: `duplicate-second` falla porque la promesa resuelve en vez de rechazar (8.05 s).
- Borrar el conjunto de duplicados antes de la verificación final: el duplicado inicial entre fases deja de rechazarse y `duplicate-response` falla porque la promesa resuelve (8.67 s).

Ambos mutantes son detectados. Las regresiones ejercitan errores reales de aceptación del helper; no se limitan a probar el propio registro de inyección. La copia temporal se restaura y se elimina al terminar.

### Gates sobre el código final

Ambiente: macOS, Node v22.23.3, npm 10.9.9 y dependencias existentes. Las dos repeticiones focalizadas fueron secuenciales y se detenían ante cualquier fallo; coincidieron con el harness completo para comprobar también ejecución bajo carga. Los 55 casos fuera del filtro en cada repetición no se cuentan como aprobados; el archivo y el harness completos sí los ejecutaron.

| Comando / verificación | Resultado |
| --- | --- |
| `npx vitest run --config e2e-harness-tests/vitest.config.ts e2e-harness-tests/unit/s4-media.test.ts` | PASS 61/61; 155.74 s |
| Mismo comando con `-t 'rejects .* CDP evidence'`, repetición 1 | PASS 6/6 seleccionados, 21 recorridos Chromium; 117.89 s |
| Mismo comando con `-t 'rejects .* CDP evidence'`, repetición 2 | PASS 6/6 seleccionados, 21 recorridos Chromium; 117.30 s |
| `npm run test:e2e:harness` | PASS 364/364, 16 archivos; 155.88 s |
| `npm run typecheck` | PASS sobre el código final |
| `npm run lint` | PASS sobre el código final; cero warnings |
| `npm test` | PASS 1315/1315, 48 archivos; 14.86 s |
| `npm run build` | PASS; aviso preexistente de chunk de 644.12 kB |
| `git diff --check` | PASS |

Los 61 tests del archivo y los 364 del harness se conservan; los seis negativos ejecutan 21 recorridos Chromium en total (18 variantes de modo/orden y tres duplicados entre fases). No se añaden skips, retries, sleeps de estabilización ni timeouts globales. Los timers de entrega se limpian en finally y las sesiones CDP se cierran por el helper existente. CORS/TypeError no sustituyen un HTTP 403 real, se conserva la misma capacidad y no se publican URLs, tokens ni headers privados en la instrumentación.

### Gitleaks y límites

Los dos fingerprints de `.gitleaksignore` conservan el formato SHA:archivo:regla:línea. Se comprobó que cada commit y archivo existe y que la línea histórica corresponde al marcador sintético previsto, incluido el S4 de `5de4e2ea3810690a3b213749d3f1d6ec4e820002`, línea 23. No se elimina ni amplía la excepción; `.gitleaksignore` no cambia.

GITLEAKS LOCAL: NOT_RUN — no hay binario Gitleaks v8.30.1 disponible en el entorno. Su aprobación, al igual que npm audit no ejecutado aquí, sigue pendiente de GitHub Actions. Docker está instalado, pero su daemon/socket no está disponible; no hay un entorno Linux local operativo y no se instala infraestructura adicional.

La repetición local con Chromium/macOS no certifica Linux CI. El propietario debe publicar manualmente el commit y comprobar el nuevo workflow. No se ejecutaron Clerk/API/PostgreSQL/R2 reales, staging ni QA. Se preservan S4-03 PENDING, los cinco E2E reales sin ejecutar y las precondiciones anteriores. Esta corrección no reabre la aprobación del runner ni convierte evidencia sintética en E2E real. Se crea únicamente un commit local, sin push, PR nuevo ni merge; SHA y estado Git se entregan en el handoff.

S4-F07-D CDP CI FIX: READY_FOR_REVIEW

S4 REAL E2E: BLOCKED

SPRINT 4: NOT_READY
