# S4-F01 — Generic Media Client: implementación y verificación

Fecha: 2026-10-06 (America/Bogota). Repositorio: TallerMecario frontend.
Rama: `task/s4-f01-media-client`. Base: `563f010`.
Alcance: únicamente S4-F01; foundation online para consumidores posteriores.

## Archivos cambiados

| Archivo | Cambio |
| --- | --- |
| `src/shared/media/media-client.ts` | Ciclo create → parse → PUT → complete → resultado confirmado |
| `src/shared/media/media-upload.ts` | PUT directo, cancelación, validación de expiresAt y protección de Content-Type |
| `src/shared/media/media-contract.ts` | Parsers genéricos de sesión, destino y media confirmada |
| `src/shared/media/media-errors.ts` | Clasificación de almacenamiento y copy estático |
| `src/shared/media/media-types.ts` | Tipos públicos, resultados discriminados y puerto de API |
| `src/shared/media/media-contract.test.ts` | Validación de DTO, URL, headers y campos confirmados |
| `src/shared/media/media-upload.test.ts` | Transporte, MIME, cancelación, clasificación y privacidad |
| `src/shared/media/media-client.test.ts` | Secuencia, aislamiento API/storage, fallos y ausencia de contratos específicos |
| `src/test/media-fixtures.ts` | Fixtures sintéticas sin datos reales |
| `src/features/reception/reception-api.ts` | Consume los parsers extraídos desde shared |
| `src/features/reception/reception-workflow-contract.ts` | Retira las definiciones duplicadas de sesión y completion |
| `src/features/reception/reception-workflow.test.tsx` | Migra cobertura genérica a sus pruebas propias; conserva regresiones de recepción |
| `src/features/reception/reception-media-upload.ts` | Eliminado: transporte de firma sin imports de producción |
| `docs/quality/s4-f01-media-client-verification.md` | Este informe |

## Arquitectura y reutilización de Sprint 3

Se utiliza `src/shared/media` porque las reglas del repositorio prohíben imports entre features. Esto permite reutilizar el cliente desde recepción, daños u otros dominios sin una excepción al lint.

`createMediaClient` recibe el `ApiClient` existente y un `MediaApiAdapter<Input>`. El adaptador futuro define las rutas, cuerpos, contexto y envelopes exclusivamente con su contrato aprobado. Devuelve DTOs wire sin envelope; el cliente genérico aplica `parseUploadSession` y `parseActiveMedia`. No se implementa un adaptador de fotos/video ni un endpoint. La API recibe el cliente autenticado; el transporte de almacenamiento recibe únicamente la sesión, el Blob, la señal y un fetch inyectable.

Se extraen el PUT directo y los parsers de sesión/completion de Sprint 3. Se conservan las validaciones de IDs, método PUT, estado pending, expiresAt como dato de contrato y completion active con identidad coincidente, tamaño y checksum. Se reutilizan `ApiClient`, `ApiResult`, `ApiFailure` y los helpers genéricos de UUID/record existentes. Se añade validación de headers y destinos, protección de Content-Type, cancelación con limpieza del listener y un modelo independiente de errores de almacenamiento.

Los errores autenticados conservan su `ApiFailure` íntegro, incluido código, status y requestId, más la etapa create/complete. La creación no pasa a PUT si la respuesta es inválida; complete sólo ocurre después de PUT exitoso. No hay reintentos automáticos. El resultado público contiene sólo `mediaAssetId`, `status`, `sizeBytes` y `checksumSha256`. El adaptador de complete recibe únicamente los IDs, sin URL ni objectKey.

## Acoplamiento de firma y límites de alcance

La búsqueda inicial encontró `reception-media-upload.ts` importado únicamente por `reception-workflow.test.tsx`; ningún módulo de producción lo importaba. Se elimina para evitar un segundo PUT con clasificación de almacenamiento como RBAC. El parser genérico deja de vivir en `reception-workflow-contract.ts` y la API histórica usa el parser compartido.

La implementación genérica no contiene valores de firma, recepción, MIME específicos, retentionClass, mediaType ni rutas de producto. Las pruebas de recepción conservan el cierre sin firma, la ausencia de solicitudes de media/captura y las firmas históricas visibles.

Se conservan los métodos históricos de firma en `reception-api.ts`, el pad y otros artefactos de firma: su limpieza no es necesaria para evitar duplicar el PUT/parser genérico. No se restaura ningún flujo UI. La decisión aprobada del 2026-10-05 sigue vigente; no se reescriben los snapshots ni los contratos compartidos.

No se modifica backend, UI de fotos/video, IndexedDB, service worker, cola offline, recuperación, progreso ni configuración CORS. No se añaden bibliotecas ni cambian package.json/package-lock.json.

## Garantías del PUT firmado

- URL utilizada directamente, nunca mediante ApiClient; HTTPS obligatorio, sin userinfo, fragmentos ni controles.
- `credentials: 'omit'`, `redirect: 'error'`, método PUT y la misma AbortSignal.
- Sólo headers emitidos por la sesión; rechazo de Authorization, X-Tenant-Id, Cookie y headers de credenciales/control del navegador, nombres inválidos, duplicados por casing y valores que el navegador normalizaría.
- El Blob enviado se obtiene con `slice(0, size, '')`: conserva los bytes y retira el MIME implícito. Si hay Content-Type firmado, se envía exactamente ese valor; si no hay, File/Blob no añade otro. Se verifica mediante `Request`, headers y lectura de bytes en pruebas Node.
- Validación del destino repetida en PUT; no basta con que un consumidor declare el tipo TypeScript.
- expiresAt se parsea y valida como dato de contrato y permanece disponible en la sesión. El frontend no usa el reloj del dispositivo para impedir el PUT; storage determina la validez y expiración de la URL firmada.
- El objectKey wire se valida y descarta. La URL permanece transitoria; ningún error/copy copia URLs, objectKeys, mensajes de excepciones o cuerpos arbitrarios.
- Nunca se leen cuerpos de almacenamiento, ni siquiera ante errores. No hay logs de destinos firmados.
- Señal ya abortada evita el request. Cancelación activa llega a fetch y termina el resultado; una respuesta tardía se descarta. El listener se retira y abortar después de completar no modifica el éxito.

## Taxonomía de fallos

| Origen / caso | Resultado |
| --- | --- |
| API create/complete | `source: api`, etapa y ApiFailure existente preservado |
| DTO de sesión/completion inválido | `source: contract`, `invalid_upload_session` / `invalid_completion` |
| Cancelación entre etapas | `source: client`, `aborted` |
| Cancelación durante PUT | `source: storage`, `aborted` |
| Error de conexión del PUT | `network` |
| Storage 403 | `signed_url_rejected`; puede ser vencimiento/firma inválida, no prueba RBAC ni una causa concreta |
| Storage 413 | `payload_too_large` |
| Storage 415 | `unsupported_media_type` |
| Storage 422 | `unprocessable_upload` |
| Otro status de error | `unexpected_status` |
| Redirección observada | `unexpected_redirect` |
| Destino/headers/vencimiento malformados | `invalid_upload_target` |

El copy de almacenamiento es fijo y no expone proveedor ni detalles internos. `aborted` devuelve copy null. Storage es la autoridad sobre la validez y expiración de la URL firmada; un 403 conserva `signed_url_rejected`. El tipo `session_expired` permanece en la taxonomía existente, pero el transporte no lo emite basándose en el reloj local.

## Pruebas y comandos ejecutados

Runtime: Node `v22.23.3`, compatible con `.nvmrc` 22 y `engines >=22.22.2 <23`.
Los gates de verificación se repiten después del fix de reloj. La instalación y comprobación de dependencias corresponden a la implementación inicial; este fix no requiere instalación.

| Comando | Resultado final |
| --- | --- |
| `npm install --ignore-scripts --cache /private/tmp/s4-f01-npm-cache --prefer-offline --no-audit --no-fund` | Exit 0; instala los 3 paquetes fijados de Playwright que faltaban; sin cambios de manifest/lockfile |
| `npm ls @playwright/test --depth=0` | Exit 0; `@playwright/test@1.63.0` disponible |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; cero warnings |
| `npm test -- src/shared/media` | Exit 0; 84/84 pruebas, 3 archivos |
| `npm test` | Exit 0; 622/622 pruebas, 34 archivos |
| `npm run test:e2e:harness` | Exit 0; 191/191 pruebas, 11 archivos; incluye Chromium contra fixtures sintéticas del harness |
| `npm run build` | Exit 0; 175 módulos; aviso de chunk >500 kB, bundle principal 544.39 kB |
| `git diff --check` | Exit 0 |
| `git status --short` | Antes del commit: sólo los 3 archivos del fix modificados; status final en la respuesta |

La primera instalación dentro del sandbox falló con ENOTFOUND; la repetición autorizada completó la instalación. El primer typecheck confirmó realmente la ausencia de Playwright; también se corrigieron diagnostics de las nuevas pruebas y lint antes de obtener los resultados finales anteriores. No se afirman como exitosos esos primeros intentos.

Los 19 casos mínimos quedan cubiertos en los 3 archivos de pruebas de media: URL válida/HTTP/userinfo; headers peligrosos; credentials/redirect/headers exactos; aislamiento del ApiClient; forwarding/cancelación de señal; cuerpos privados y copy seguros; status 413/415/422/403; y una comprobación de ausencia de valores específicos en el código genérico. Se añaden los casos de señal ya abortada, cancelación posterior al éxito, reloj local adelantado con aceptación/rechazo de storage, respuesta tardía, orden de etapas y completion inválida o de otra media.

## Corrección de revisión: reloj del dispositivo

Sobre el commit revisado `f864256aaa30acd2ae9710bfdb9d9157f4679dd1` se elimina únicamente el rechazo por `expiresAt <= Date.now()`. Se mantienen el parseo, la validación de expiresAt y el tipo de sesión. No se introduce tolerancia de reloj, TTL, grace period ni sincronización de tiempo.

Archivos de este fix: `src/shared/media/media-upload.ts`, `src/shared/media/media-upload.test.ts` y este informe. La regresión parametrizada adelanta Date.now hasta 2100, por encima del expiresAt de la sesión, y comprueba que el PUT se intenta una vez: storage 200 produce éxito y storage 403 produce `signed_url_rejected`. Las pruebas de expiresAt malformado en el parser permanecen intactas. Se entrega un commit nuevo sin reescribir el revisado, sin push ni PR.

No se ejecuta E2E de producto contra Clerk/backend/R2: S4-F01 no integra UI ni dispone de un adaptador HTTP de fotos/video aprobado. El harness sintético no demuestra integración de media ni CORS real.

## CONTRACT_DEPENDENCY y entrega

Referencias: `docs/api/reception-and-media-contract-status.md` y `docs/OPEN-QUESTIONS.md` FE-DOC-08. Los diagramas y las columnas SQL no establecen contratos HTTP. El shape común reutilizado de Sprint 3 necesita confirmación de Track A para integrarlo con fotos/video.

- CONTRACT_DEPENDENCY: rutas y cuerpos de creación de sesión para fotos/video; valores API de mediaType/retentionClass, allowlists MIME y límites de tamaño/duración.
- CONTRACT_DEPENDENCY: complete para fotos/video, envelopes/DTOs definitivos, errores y garantías de idempotencia/concurrencia. Los tipos wire reutilizados no constituyen aprobación del contrato de Track A.
- CONTRACT_DEPENDENCY: asociación reception-media y damage-media, permisos/consentimiento de cada operación.
- CONTRACT_DEPENDENCY: download/rendering autorizado y eliminación de media sin vínculo.
- Dependencia de infraestructura: R2 CORS. No se intenta corregir desde el frontend ni se declara validado.

Estas dependencias limitan integraciones posteriores; no impiden revisar la foundation genérica entregada. Git: commit local en la rama solicitada, sin push ni PR. El hash exacto y el status posterior al commit se entregan en la respuesta final.
