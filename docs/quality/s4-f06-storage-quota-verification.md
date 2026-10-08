# S4-F06 — Browser Storage Quota / Persistence Boundaries

Fecha: 2026-10-08 (America/Bogota). Repositorio: TallerMecario frontend.

## Base, head y alcance

- Base: `5a9a1553619fa27c08214fa67c3c09182555bba0` (main, merge F05).
- Head: único commit `feat(storage): add browser quota and persistence capabilities` en `task/s4-f06-storage-quota`. El hash final se entrega en el reporte de la tarea y se resuelve con `git rev-parse HEAD` desde esta rama. No se incluye un hash autorreferencial en este archivo.
- Worktree limpio existente reutilizado: `/Users/ivanby/Documents/Proyectos/TallerMecario-worktrees/s4-f06-storage-quota`.
- Runtime: Node `v22.23.3`, compatible con `.nvmrc` 22 y engines `>=22.22.2 <23`.
- Dependencias existentes reutilizadas mediante enlace temporal a node_modules del checkout principal; enlace retirado antes del commit. Sin dependencias ni lockfile nuevos. Sin push ni PR.

Archivos añadidos, exclusivamente:

1. `src/shared/storage/storage-types.ts`
2. `src/shared/storage/storage-capabilities.ts`
3. `src/shared/storage/storage-quota.ts`
4. `src/shared/storage/storage-capabilities.test.ts`
5. `src/shared/storage/storage-quota.test.ts`
6. `docs/quality/s4-f06-storage-quota-verification.md`

## Fuentes y decisión de arquitectura

Se leyeron AGENTS.md, reglas de arquitectura, PWA/offline, media, privacidad, quality y Git; se inspeccionaron las secciones pertinentes de frontend-boundary, roadmap/gates S13, pwa-offline, ADR-005 §Media offline y límites de almacenamiento, media/ADR-003, privacidad y OPEN-QUESTIONS (FE-DOC-02/04/05/06/08/14). Los contratos y el informe F05 conservan las dependencias HTTP de media: esta tarea no depende de integrar esos contratos.

No hay umbral numérico canónico en estas fuentes. ADR-005 contempla consulta/solicitud antes de media grande offline en el alcance futuro; S4-F06 no integra ese flujo ni solicita persistencia automáticamente. La especificación de este ticket fija la frontera explícita de foundation S4 frente a S13. No se modificaron contratos compartidos ni decisiones de producto.

Módulo genérico `src/shared/storage/`, sin dependencias de recepción, auth, media, React ni backend. Se sigue la convención existente de archivos con exports nombrados e imports locales. No hook, controller, UI, formatter, copy de producto ni settings nuevos: no existe ubicación canónica que los requiera.

API:

- `readBrowserStorageCapabilities()` devuelve un snapshot nuevo. Consulta estimate y persisted independientemente y en paralelo; detecta soporte de persist sin ejecutarlo.
- `requestPersistence()` ejecuta exclusivamente una solicitud explícita. No estima cuota ni sintetiza/refresca persisted.
- `parseStorageQuota(unknown)` valida y reduce la respuesta del navegador.
- `evaluateStoragePressure(estimate, policy?)` evalúa únicamente una política del consumidor.
- Tipos públicos readonly documentan los datos genéricos y sus límites. No se devuelve ninguna referencia a objetos del navegador.

## Modelo de soporte y degradación

| Dimensión | Estados |
| --- | --- |
| storage | `unavailable`, `available` |
| estimate y solicitud persist | Soporte independiente `unsupported`, `available` |
| quota | `{ status: 'unknown' }` o `{ status: 'known', usageBytes, quotaBytes, ratio }` |
| persisted / resultado de solicitud | `unsupported`, `unknown`, `granted`, `not_granted` |
| presión | `unconfigured`, `invalid_policy`, `unknown`, `normal`, `warning`, `critical` |

Detección por presencia/callability, sin browser sniffing. Falta de navigator/storage, objeto storage malformado o getter de storage inaccesible → unavailable. Método ausente, no callable o getter inaccesible → unsupported para ese método; los restantes siguen funcionando. Método callable que lanza/rechaza o devuelve datos malformados → unknown. Ninguna excepción/DOMException ni su message se propaga al estado público. Se preserva el receiver nativo de todos los métodos.

## Cuota y presión

Solo se leen usage y quota. usage debe ser número finito >=0 y quota número finito >0. Campos ausentes, strings, null, NaN, infinities, negativos o quota=0 producen unknown, sin convertirlo a cero. usage=0 es válido. getters que fallan también degradan a unknown.

`usageBytes` conserva el valor validado, incluso si supera quota; `ratio = min(usage / quota, 1)` queda entre 0 y 1. Se verifica incluso overshoot extremo que desborda la división. No se muta la respuesta original. Un consumidor que presente overshoot debe limitar solamente su valor de display; el módulo no añade display/formatter.

Se ignora usageDetails sin leerlo: no demuestra uso de media. La cuota es una estimación del origen dependiente de navegador/dispositivo, no espacio reservado exclusivamente a TallerMecario, ni capacidad exacta o garantía para una escritura futura.

No hay valores default de warning/critical. Sin política o con política vacía → unconfigured incluso con ratio=1. warningRatio y criticalRatio opcionales deben ser finitos dentro de [0,1], con warning<=critical cuando ambos existen. Política inválida → invalid_policy sin advertencia. Umbrales inclusivos; critical tiene precedencia y se permite igualdad. Estimación desconocida con política válida → unknown. Los valores numéricos de ejemplo en tests son fixtures, no política de producto.

## Persistencia consultada y solicitada

`persisted()` true → granted; false → not_granted (decisión válida, no error). Rechazo, excepción o valor no booleano → unknown. La existencia de estimate no implica persisted ni persist, y persisted tampoco implica capacidad de solicitar.

`requestPersistence()` ofrece los mismos cuatro estados a partir exclusivamente de persist. No se ejecuta al importar, leer snapshots, montar UI, capturar media o iniciar sesión. Cada llamada explícita es independiente, con una única invocación, sin loops/retries ni estado memoizado. true no significa mayor cuota ni garantía universal contra evicción/borrado del usuario. La API informa la decisión actual del navegador y no promesas de retención.

## Privacidad, SSR y lifecycle

El estado público contiene solo enums y números de uso/cuota/ratio del origen. No incorpora usageDetails, filenames, Files, URLs, mediaAssetIds, recepciones, tenants, clientes o vehículos. No logs, métricas/analytics ni envío de información por red. Los fallos son enums genéricos; no se copian cuerpos, mensajes ni objetos de excepción.

No se lee navigator al evaluar/importar el módulo; la detección ocurre en cada operación explícita. Tests importan de nuevo el módulo sin navigator y luego comprueban un cambio de soporte en una llamada posterior. Compatible con contexto browser, jsdom y ausencia de navigator SSR. No React state, subscriptions, timers, listeners, intervalos ni monitorización de fondo. Las llamadas concurrentes devuelven snapshots separados: A tardía no modifica el objeto ya devuelto por B. Un futuro hook consumidor deberá gestionar su propio unmount/generación; no se afirma haber implementado esa capa.

## Pruebas y gates finales

73 pruebas focalizadas en dos archivos cubren todos los mínimos aplicables del ticket: SSR/importación, navigator/storage ausentes, APIs parciales/getters, receiver, estimate válido/cero/overshoot, campos inválidos/ausentes, NaN/Infinity, excepción/rechazo, usageDetails ignorado, persisted/persist true/false/unsupported/malformed/fallos, solicitudes independientes y nunca automáticas, políticas válidas/inválidas/sin default, snapshots concurrentes independientes, privacidad y ausencia de red/escrituras/polling. No hook/controller, por lo que los gates de React unmount no aplican.

Las pruebas de límites bloquean APIs de red, mecanismos de almacenamiento de datos y timers; las operaciones públicas no los invocan. Una prueba estática examina los tres módulos de producción y exige ausencia de mecanismos prohibidos. Se inspeccionó además el diff de producción separado de tests/docs: ninguna coincidencia.

| Comando exacto | Resultado final |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, cero warnings |
| `npm test -- src/shared/storage` | PASS: 73 pruebas, 2 archivos |
| `npm test -- src/shared/media` | PASS: 329 pruebas, 10 archivos |
| `npm test -- src/features/reception` | PASS: 237 pruebas, 7 archivos |
| `npm test` | PASS: 997 pruebas, 44 archivos; auth y CRM incluidos |
| `npm run test:e2e:harness` | PASS: 191 pruebas, 11 archivos; harness sintético |
| `npm run build` | PASS; advertencia existente de chunk >500 kB (571.60 kB) |
| `git diff --check` | PASS; también se comprueba el diff staged antes del commit |
| `git status --short` | Limpio después del único commit |

TypeScript y lint detectaron inicialmente un acceso indexado sobre object, retorno any de Function.call, una condición redundante y un import() de test restringido por las reglas de capas. Se corrigieron sin suprimir diagnósticos, sin cambiar configuración y sin añadir excepciones. La tabla refleja las ejecuciones finales exitosas.

## Evidencia de navegador

Chromium real headless `153.0.8010.12` (Playwright instalado), perfil efímero, origen local `http://127.0.0.1:5174` considerado secure context. HTML mínimo servido por el harness; se importa el módulo real mediante Vite, sin arrancar el producto/auth ni mocks de StorageManager.

- navigator.storage: object; estimate, persisted y persist: function.
- Resultado del módulo: support available, estimateSupport available, usageBytes=0, quotaBytes=4294967296 (4 GiB), ratio=0, persistenceStatus not_granted, persistenceRequestSupport available.
- No se ejercitó persist() en el navegador. Las decisiones de solicitud se verificaron con fixtures en tests.
- Cero pageerrors. Solo tres requests locales: HTML del harness y los dos módulos; ninguna métrica/network reporting de la API.
- Artefactos temporales externos al repositorio: `/private/tmp/s4-f06-source/browser-evidence.mjs` y `/private/tmp/s4-f06-browser/results.json`.

Resultados específicos de ese entorno. No prueba otros navegadores, persistencia concedida, espacio reservable ni estabilidad de cuota. Sin media del usuario, cámara, backend o R2. No se ejecutó E2E autenticado real.

## No-goals y frontera Sprint 13

**NO File/Blob/media persistence implemented.**

No IndexedDB, File/Blob storage, metadata/queue/upload-task persistence, service worker queue, Background Sync, OPFS, File System Access, CacheStorage media, localStorage ni sessionStorage nuevos. No offline-first, reload recovery, limpieza/evicción, eliminación de media, cancelación de uploads ni bloqueo de recepción por cuota.

F01–F05, recepción, auth, CRM y harness no se modifican. La capacidad productiva de media F05 permanece unavailable; disponer de StorageManager no establece el HTTP pendiente ni habilita captura, y no se añade cuota como prerequisite de recepción/media.

Este módulo es una foundation/prerequisito para persistencia futura. ADR-005 / Sprint 13 conserva las decisiones de esquema IndexedDB, esquema/orden de queue media, orden de evicción, política de carga offline, formato de persistencia de archivos, cifrado en reposo, aislamiento local, sincronización y recuperación tras reload. F06 no cumple ni declara cumplido el gate offline completo.
