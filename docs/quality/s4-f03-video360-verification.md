# S4-F03 — Selección/captura local de video 360: verificación

Fecha: 2026-10-06 (America/Bogota). Repositorio: TallerMecario frontend.
Rama: `task/s4-f03-video360`.
Base: `9af9dfeec19a9a133e40aa6a37984956ca52bbbc` (S4-F02 integrado).
Worktree existente reutilizado: `/Users/ivanby/.tallermecario-frontend-worktrees/s4-f03`.
Node: `v22.23.3`, compatible con `.nvmrc` y package engines.
Alcance: exclusivamente S4-F03; video de recorrido del vehículo, sin stitching.
El componente no se monta todavía en rutas de negocio.

## Archivos exactos del cambio

- `src/shared/media/video/video-types.ts`
- `src/shared/media/video/video-validation.ts`
- `src/shared/media/video/video-metadata.ts`
- `src/shared/media/video/video-selection.ts`
- `src/shared/media/video/video-picker.tsx`
- `src/shared/media/video/video-preview.tsx`
- `src/shared/media/video/video-validation.test.ts`
- `src/shared/media/video/video-picker.test.tsx`
- `src/app/app.css`
- `docs/quality/s4-f03-video360-verification.md`

No se modifican dependencias, contratos compartidos, S4-F01, S4-F02, backend,
recepción, daños, autenticación, CRM ni el harness existente.

## Arquitectura y modelo local

`shared/media/video` no depende de features ni transporte.
`VideoSelection` contiene únicamente `{ id, file, durationSeconds }`.
Conserva exactamente el File original, sin copiar bytes, duplicar nombre/tipo/tamaño,
transformar, comprimir, generar frames/posters, extraer EXIF ni calcular hashes.
No contiene IDs de dominio, endpoints, mediaType, retentionClass ni sort_order.

`useVideoSelection` administra una selección aceptada y, como máximo, un candidato
pendiente de metadata. Mantener un video aceptado es una decisión local de UX;
no establece una cantidad máxima canónica del backend. Durante un reemplazo
pueden coexistir temporalmente los recursos de A aceptado y B candidato.

Los IDs se asignan por interacción, con prefijo de instancia React y contador.
Un rerender conserva el ID. El nombre del archivo no identifica una selección.
Elegir el mismo File nuevamente crea un nuevo intento/ID, conservando ese mismo
objeto File. No se hace hashing ni deduplicación de contenido.

El estado expone `video`, `status` e `issue`:
- `idle`: sin selección/intento.
- La selección y validación estructural/de política son síncronas antes de crear
  recursos; no hay una fase de render artificial para esos pasos.
- `metadata_loading`: candidato pendiente; A aceptado permanece utilizable.
- `ready`: candidato aceptado, con duración finita positiva.
- `rejected`: intento rechazado con código seguro; A aceptado puede seguir ready.

`onSelectionChange` informa solo la selección aceptada o null al limpiar,
sin URL ni candidato pendiente. `useEffectEvent` evita reemitir por el cambio de
identidad de callbacks inline. Los padres deben liberar sus propias referencias
a Files al limpiar/desmontar; el callback no constituye persistencia.
Cambiar el key reinicia selección y reconocimiento local del aviso.

## Captura y selección

Dos inputs nativos, visibles, separados, etiquetados y de un archivo:
- Grabar video: `accept="video/*"`, `capture="environment"`.
- Seleccionar video: `accept="video/*"`, sin capture.

Capture es únicamente una sugerencia: no garantiza cámara trasera, grabación ni
comportamiento uniforme entre navegadores/dispositivos. Accept orienta el selector
y no es una allowlist del servidor. No hay browser sniffing ni getUserMedia.
Cancelar el selector conserva selección/candidato existente. Cada evento reinicia
el value del input, incluso si no trae File, para permitir volver a elegirlo.

## Validación

Política opcional: `allowedMimeTypes`, `maxBytes`, `maxDurationSeconds`, sin
defaults de producto. Límites inválidos y allowlist mal formada producen
`invalid_policy`; bytes deben ser enteros seguros no negativos y el límite
de duración debe ser finito positivo.

Se rechazan valores no File/utilizables, archivos vacíos y MIME conocido que no
declare video. No se valida por extensión ni se inspecciona contenido.
MIME vacío se acepta sin allowlist y pasa al decoder; con allowlist requiere
coincidencia explícita, incluido '' si el consumidor lo configura.
Los MIME/límites de fixtures son ejemplos sintéticos, no contratos de Track A.

MaxBytes se aplica antes de metadata; maxDurationSeconds se aplica después de
loadedmetadata y antes de ready. La igualdad con el límite es válida.
NaN, Infinity, -Infinity, cero y duración negativa se rechazan incluso sin límite.
Los cambios de props de política aplican a futuros intentos; cada intento usa
una copia de su configuración. No borran selecciones aceptadas previamente.

Errores locales: invalid_policy, invalid_file, empty_file, not_video,
mime_not_allowed, too_large, metadata_unavailable, invalid_duration, too_long.
Copy estático, separado de errores storage/API y sin nombre del archivo, path,
blob URL, stack trace o excepción del navegador.

## Metadata, carreras y ownership de URLs

`createVideoMetadataResource` crea fuera del render un URL del File original y
un video separado del DOM con preload=metadata. Escucha loadedmetadata/error,
lee únicamente duration y desprende listeners/src, llamando load() para detener
el decoder. Nunca carga el archivo entero en memoria JS ni hace seek.

Un único URL por intento sirve al decoder y, al aceptarse, al preview nativo.
El recurso tiene dispose idempotente: resuelve el trabajo cancelado sin rechazo,
desprende el decoder y revoca exclusivamente su propio URL una sola vez.
El URL queda dentro de la capa de presentación local, separado de VideoSelection
y del callback del padre. VideoPreview no asigna URLs.

Cada nuevo intento y clear invalidan la generación anterior y disponen el
candidato pendiente. Los resultados verifican generación y montaje antes de
actualizar estado. Las funciones de evento también se vuelven inertes al terminar
el recurso. Esto cubre eventos tardíos y promesas ya resueltas aún en la cola.

Los recursos aceptados se conservan mientras estén en el DOM. El efecto posterior
al commit libera selecciones anteriores, incluidos recursos promovidos que React
agrupó y nunca renderizó. Protege el candidato pendiente y la última aceptación
aunque un efecto provenga de un commit anterior. Desmontar dispone todo recurso
restante. En Strict Mode no hay asignación durante render ni duplicación por
efectos de prueba; dispose y los guards mantienen el balance exacto.

Casos comprobados:
- Validación estructural fallida: no se crea URL.
- Error de metadata/duración o límite excedido: solo se revoca B.
- Reemplazo válido: A continúa durante metadata de B; se revoca A después de que
  el DOM pasa a B, manteniendo el URL de B hasta su propio cleanup.
- Quitar/reset: revoca candidato pendiente y selección aceptada, sin doble revoke.
- Desmontaje durante metadata, callbacks viejos y promesas en cola: sin publicación
  posterior ni recursos restantes.
- Rerender ordinario: no crea URLs ni cambia IDs.
- Error de playback del preview: fallback seguro; el recurso continúa perteneciendo
  a la selección hasta quitar/reemplazar/desmontar.

No se impone un timeout de producto: si el navegador no emite metadata/error,
el intento queda pendiente hasta quitarlo, reemplazarlo o desmontar.

## Reemplazo preferido

Un B inválido nunca destruye A válido. La UI conserva A/File/ID/duración/preview
mientras muestra feedback del intento B. Solo B completamente validado reemplaza
A. Seleccionar C cancela cualquier B pendiente; B tardío no sobrescribe C.
Clear también invalida intentos y limpia selección/feedback.

## Privacidad, accesibilidad y responsive

Se reutilizan StatusBanner, tokens y el patrón de foco de S4-F02, con la misma
guía de `docs/privacy/privacy-product-requirements.md` §5: avisar antes de
capturar, centrarse en vehículo/evidencia y evitar rostros/PII innecesarios.
No existe un helper compartido de copy de fotos que requiera extraerse; no se
refactoriza S4-F02.

Aviso seguido de casilla local no premarcada; capture/select están deshabilitados
hasta reconocerlo. No crea consentimiento backend ni sustituye autorización,
adult attestation, permisos o guards de una futura integración de recepción.
Nada se guarda fuera del estado local del componente.

Labels nativos e IDs useId distintos por instancia; instrucciones/aviso en
aria-describedby; feedback aria-live polite; fallback de preview role=status;
botón Quitar video accesible. El video tiene controls, preload=metadata y sin
autoplay. Los nombres de archivos no se incorporan a copy ni al modelo.

Tras quitar un botón enfocado, useLayoutEffect restaura foco después de retirar
el DOM: al selector local o a la casilla si el aviso se desmarcó. No roba foco
movido a otra parte. Reemplazar no desmonta el control de selección enfocado.
Las instancias conservan sus recursos y foco de manera independiente.

CSS limitado a .video-picker/.video-preview, usando tokens existentes, min-width:0,
inputs contenidos, texto con wrap y video con width/max-width:100% y max-height:60vh.
No hay CSS global para video.

## Pruebas enfocadas

75 tests en 2 archivos: 26 de validación y 49 de picker/resources/hook.
Doble controlable de load y listeners reales del elemento permite provocar
loadedmetadata/error y ejecutar callbacks guardados después de su cancelación.

Cobertura: aviso/capture/fallback; File original; IDs/rerenders/filenames/reselección;
reset de inputs; MIME vacío y políticas explícitas; bytes/duración y límites;
duraciones no finitas/positivas; errores seguros; ausencia de red/lectura integral;
ownership exacto en reemplazo/remove/unmount/Strict Mode; foco e instancias aisladas.
Carreras bloqueantes comprobadas: A pendiente → B ready → A tardío; desmontaje
pendiente → callback tardío; A ready → B inválido. También promesas resueltas en
cola, metadata síncrona, clear antes de commit y dos promociones agrupadas.

## Gates ejecutados

Todos los comandos se ejecutaron en el worktree indicado, con Node v22.23.3.

| Comando | Resultado definitivo |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, sin warnings |
| `npm test -- src/shared/media/video` | PASS, 2 archivos / 75 tests, exit 0 |
| `npm test` | PASS, 39 archivos / 753 tests, exit 0 |
| `npm run test:e2e:harness` | PASS, 11 archivos / 191 tests, exit 0 |
| `npm run build` | PASS, exit 0; warning existente de bundle JS >500 kB (543.91 kB) |
| `git diff --check` | PASS, exit 0 |
| `git status --short` | Revisado: solo alcance y symlink node_modules preexistente |

La primera corrida enfocada detectó que restoreMocks retiraba los spies instalados
a nivel de módulo; se corrigió instalándolos en beforeEach. El lint inicial detectó
una referencia mutable de generación en cleanup; se captura el objeto de ref
estable para expresar su ownership. Las corridas definitivas anteriores pasan.

## Evidencia de navegador

Comando: `node /private/tmp/tallermecario-s4-f03-browser/verify.mjs`.
Resultado: exit 0, Chromium headless, tres viewports (320, 390, 768 px).
Fixture aislada fuera del repositorio, importando directamente componente y CSS.
El video se genera con un canvas sintético/MediaRecorder, sin cámara de dispositivo.
La duración del decoder se controla a 1 segundo mediante un doble: esta verificación
prueba layout/teclado/URLs y no prueba duración nativa real.

Artefactos:
- `/private/tmp/tallermecario-s4-f03-browser/results.json`
- `/private/tmp/tallermecario-s4-f03-browser/video-320.png`
- `/private/tmp/tallermecario-s4-f03-browser/video-390.png`
- `/private/tmp/tallermecario-s4-f03-browser/video-768.png`
- Harness reproducible local: verify.mjs, app.tsx, index.html en ese directorio.

Sin overflow: scrollWidth igual a viewport (320/390/768); preview igual al ancho
disponible del picker (288/358/736). Controls=true, autoplay=false.
Space reconoce aviso; Tab alcanza capture/select; Enter quita; foco vuelve al selector.
En cada instancia probada, un URL creado y su URL exacto revocado, sin pageerrors.
La captura de 320 px fue inspeccionada visualmente. Artefactos temporales no versionados.

## CONTRACT_DEPENDENCY y áreas no validadas

Siguen pendientes de Track A, sin bloquear este componente local:
- Allowlist MIME canónica de video.
- Máximo canónico de bytes y duración.
- mediaType y retentionClass.
- Request de upload-session y contrato complete.
- Idempotencia, asociaciones recepción/daños y ordering de servidor.
- Validación real browser → R2 / CORS.

No se realizó cámara real ni hardware Android/iOS; compatibilidad/códecs y duración
de videos reales en esos dispositivos siguen sin validar. No se ejecutó backend
E2E, upload R2, CORS real, instalación PWA, offline/persistencia ni recepción integrada.
El build verifica la aplicación actual: como el picker no se monta en rutas,
sus módulos se verifican mediante TypeScript, tests y el harness aislado.

Sin fetch/XHR/ApiClient/MediaClient/PUT en producción de este módulo; tampoco
getUserMedia, localStorage, IndexedDB, service worker, compresión, retry/progreso
o recovery. Una búsqueda estática sobre sus seis archivos de producción confirmó
ausencia de esas dependencias y conceptos de recepción/storage.

## Git

Se prepara un único commit de implementación tras los gates:
`feat(media): add local video capture and preview`.
El hash del commit/HEAD se informa al entregar (el documento no incorpora su propio
hash). Sin push ni PR. `?? node_modules` ya existía al iniciar este worktree:
es un symlink a las dependencias del checkout principal; se conserva y no se incluye
en el commit. Se inspecciona además `git diff --cached --check` al preparar el commit.
