# S4-F02 — Local Photo Capture: implementación y verificación

Fecha: 2026-10-06 (America/Bogota). Repositorio: TallerMecario frontend.
Rama: `task/s4-f02-photo-capture`.
Base: `bebd4b5b1f89eed672ce2ad916fa81f26a9a554f`.
Alcance: únicamente selección/captura local reutilizable; sin integración en recepción.

## Archivos cambiados

- `src/shared/media/photo/photo-types.ts`
- `src/shared/media/photo/photo-validation.ts`
- `src/shared/media/photo/photo-selection.ts`
- `src/shared/media/photo/photo-preview-list.tsx`
- `src/shared/media/photo/photo-picker.tsx`
- `src/shared/media/photo/photo-validation.test.ts`
- `src/shared/media/photo/photo-selection.test.tsx`
- `src/shared/media/photo/photo-picker.test.tsx`
- `src/app/app.css`
- `docs/quality/s4-f02-photo-capture-verification.md`

## Arquitectura y modelo local

`shared/media/photo` no importa features ni transporte. `PhotoSelection` contiene
únicamente `{ id, file }`: conserva el File original sin copiar bytes ni duplicar
name/size/type. Un consumidor futuro puede pasar `photo.file` al transporte S4-F01
con su contrato aprobado. No contiene IDs de dominio, mediaType, retentionClass,
rutas HTTP ni sort_order. No se cambia S4-F01, recepción, identidad, contexto o CRM.
El picker todavía no se monta en ninguna ruta de negocio.

`usePhotoSelection` mantiene una sola colección en un reducer puro con
`add`, `remove`, `clear` y `replace`. Cada interacción asigna IDs mediante un
prefijo local React y un contador; el reducer no genera IDs ni URLs. Conserva
orden de inserción entre lotes. Quitar cierra el espacio naturalmente.

Política de duplicados: cada selección válida es independiente, incluso el mismo
File repetido. Ni nombre ni metadata identifican una foto. No se hace hashing.
`onSelectionChange` comunica la colección y sus Files, nunca URLs de preview.
El callback usa `useEffectEvent` para consumir el callback vigente sin volver a
emitir solo porque su identidad cambió, evitando bucles con callbacks inline del
padre. Quien retenga Files es dueño de liberar sus referencias al limpiar/desmontar.

## Captura y galería

Dos inputs de archivo nativos, visibles y etiquetados:

- Tomar foto: `accept="image/*"`, `capture="environment"`, sin `multiple`.
- Seleccionar fotos: `accept="image/*"`, `multiple`, sin `capture`.

`accept` es una sugerencia para el picker y no una allowlist de servidor.
`capture` no garantiza cámara trasera; donde no se admite se degrada a selección
normal. Ambos inputs permiten interacciones repetidas y reinician `value` después
del evento. El FileList se convierte inmediatamente en un array; no se guarda.
Cancelar conserva la colección existente. No hay browser sniffing/getUserMedia.

## Validación y feedback

`PhotoValidationPolicy` permite inyectar `allowedMimeTypes`, `maxBytes` y
`maxFiles`, todos opcionales y sin defaults de producto. La validación local
rechaza valores que no sean Files utilizables, archivos vacíos y MIME conocido
que no declare una imagen. No inspecciona extensiones ni bytes. MIME vacío se
acepta sin allowlist; con allowlist se exige coincidencia explícita, sin adivinar
un formato. Un formato declarado image puede no ser decodificable; la UI entonces
muestra un fallback seguro y conserva el File para que el usuario pueda quitarlo.

Se verifican límites inyectados de bytes y cantidad; los valores inválidos de
límites producen feedback seguro. Los límites nuevos aplican a lotes siguientes;
no eliminan archivos previamente aceptados. Un rechazo no destruye fotos válidas
anteriores ni otras válidas del mismo lote. `replace` descarta explícitamente la
colección anterior; `clear` descarta colección y feedback.

Los issues son códigos locales y posición de archivo en el último lote, separados
de errores API/storage. El copy es estático y no incluye nombres, paths, URLs,
stack traces ni excepciones. La validación es UX: no verifica contenido ni
establece elegibilidad de backend/storage.

## Ownership de URLs y memoria

Cada miniatura es dueña de su object URL, creado en un efecto dependiente del File.
Los URLs no están en el modelo ni salen por el callback. El cleanup del mismo
efecto revoca exactamente el URL que creó al quitar, limpiar, reemplazar o
desmontar. Las claves estables mantienen los previews de las fotos restantes.
Un rerender no crea URLs nuevos. En Strict Mode el efecto de prueba crea/revoca
su propio URL y el efecto activo obtiene otro; cada URL se revoca exactamente una
vez y el URL activo sigue válido hasta su cleanup.

Errores de creación/decodificación presentan un mensaje estático sin detalles del
navegador. No se usa base64/DataURL, persistencia, compresión, transformación,
EXIF, analytics ni logs de archivos. El picker avisa que las fotos solo están en
la pantalla y no se han subido ni guardado.

## Privacidad, accesibilidad y responsive

Referencia: `docs/privacy/privacy-product-requirements.md`, §5: advertir antes de
fotos y evitar rostros/personas innecesarios. No existía copy reutilizable en una
UI genérica; el componente presenta esa guía y añade el foco en vehículo/evidencia
sin afirmar consentimiento legal ni crear un flujo backend.

El aviso siempre precede a los controles. La casilla “He leído este aviso” empieza
sin marcar; cámara/galería están deshabilitadas hasta marcarla. Esto solo reconoce
la advertencia local. No sustituye consentimiento, declaración adulta, permisos
ni guards de recepción: una integración posterior debe cumplir esos contratos.

Labels nativos asociados por ID; instrucciones y aviso mediante aria-describedby;
remove buttons “Quitar foto N”; alt “Vista previa de la foto N”; feedback en región
aria-live polite y fallback role=status. Inputs/botones operables por teclado,
focus visible existente y explicación cuando disabled. Los nombres de archivos
no se muestran. No se usan controles fake ni símbolos como única etiqueta.

CSS en la hoja única existente, con tokens y breakpoint de 48rem. Grid con
columnas minmax(0, 1fr), inputs de ancho limitado e imágenes contenidas.

## Pruebas y comandos ejecutados

Node `v22.23.3`, dentro de la línea Node 22 de `.nvmrc` y package engines.
Se reutilizaron dependencias ya instaladas mediante un symlink temporal externo
a los archivos versionados; se retira al terminar. No se cambian dependencias o lockfile.

44 pruebas nuevas: 14 de validación, 7 de selección y 23 de componente/lifecycle.
Cubren Files originales, batches, IDs estables/nombres iguales/duplicados,
rechazo parcial, policies, MIME vacío, reset de inputs, cancelación, notice gate,
accesibilidad de feedback, disabled, callback inline, URL failures/decoder,
remove/clear/replace/key reset/unmount/rerender y Strict Mode.
La prueba local-only espía fetch, createApiClient, createMediaClient y putMedia;
selección/eliminación no llama a ninguno.

| Comando | Resultado final |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, sin warnings |
| `npm test -- src/shared/media/photo` | PASS, 3 archivos / 44 tests, exit 0 |
| `npm test` | PASS, 37 archivos / 666 tests, exit 0 |
| `npm run test:e2e:harness` | PASS, 11 archivos / 191 tests, exit 0 |
| `npm run build` | PASS, exit 0; aviso de bundle JS >500 kB (543.91 kB) |
| `git diff --check` | PASS, exit 0 |
| `git status --short` | Archivos del ticket antes del commit; limpio después del commit |

Primer lint detectó un `any` proveniente del resultado de un mock; se corrigió y
se repitieron los gates afectados. La suite inicial tenía 43 pruebas nuevas;
tras agregar la regresión del callback pasó con 44 (666 totales).

Comprobación adicional con `node --input-type=module` y Playwright/Chromium en
fixture Vite temporal dentro de `/private/tmp`, eliminada después: PASS a 320,
390 y 1024 px. Verificó aviso inicial/bloqueo, habilitar con Space, foco Tab en
ambos inputs, selección múltiple con PNG sintético, previews realmente
decodificadas, quitar con Enter, agregar por el input de captura, limpiar,
sin overflow horizontal ni fetch/XHR/pageerror. La primera ejecución del runner
falló antes de abrir el navegador por importar Playwright CJS como named ESM;
se corrigió usando createRequire y se repitió con éxito. No se agregaron tests
Playwright a la configuración E2E existente.

Esta fixture prueba DOM, teclado y renderizado de escritorio Chromium con anchos
pequeños; setInputFiles no abre ni valida cámara hardware o el selector del OS.
No se validó hardware, iOS Safari ni Android Chrome en dispositivo.
No se realizó upload, backend E2E ni R2 E2E/CORS. El build no integra todavía el
picker en recepción; el componente se ejecutó en tests y la fixture aislada.

## CONTRACT_DEPENDENCY — Track A, aún sin resolver para fotos

- Allowlist MIME canónica de fotos.
- Máximo canónico de bytes.
- Máximo canónico de archivos, si existe.
- Valor API mediaType.
- retentionClass.
- Request de upload-session.
- Contrato de completion.
- Contrato de asociación.
- Semántica de orden/sort del servidor.

Ninguno bloquea esta capa local. No se inventaron valores ni se modificaron
contratos compartidos. Sin uploads, progreso/retries/recovery, endpoints,
IndexedDB/offline queue, service worker, R2/CORS, video o backend.
