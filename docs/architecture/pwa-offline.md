# PWA, almacenamiento local y sincronización

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [📱 ADR-005 — PWA + IndexedDB para operación offline](https://app.notion.com/p/3e06ab0a330d81a58a05dabdf042f145?pvs=204) · última edición: 2026-09-20T20:28:15.600Z.
- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

ADR-005 está Aceptada. CRM Sprint 2 no admite IDs del cliente ni Idempotency-Key. No reintentar POST customer automáticamente tras una respuesta ambigua. Base offline en Track B y sincronización completa S13 deben acordarse mediante un alcance explícito.

---

**Decisión:** TallerMecario será una PWA con operación offline prioritaria para recepción. IndexedDB será la base local para datos estructurados y la cola de sincronización; PostgreSQL continúa siendo la única fuente de verdad server-side.

**Estado:** Aceptada  
**Fecha:** 2026-09-19  
**Ámbito MVP:** recepción, drafts relacionados, evidencia pendiente y cola de sincronización.
# Contexto
Los talleres pueden operar con conectividad inestable. Perder una recepción por una caída de red es un riesgo operacional alto. Al mismo tiempo, una PWA no debe convertirse en una segunda base maestra ni prometer capacidades offline que los navegadores no pueden garantizar de forma uniforme.
# Decisión
- Frontend: PWA React/Vite + service worker.
- IndexedDB almacena drafts estructurados, IDs locales/UUID, `sync_queue` y metadata de operaciones.
- Cache Storage almacena app shell/recursos cacheables; no sustituye datos de negocio.
- PostgreSQL sigue siendo source of truth después de sincronizar.
- Toda mutación offline recibe `operation_id`/`idempotency_key` único y el servidor registra operaciones ya aplicadas.
- La sincronización vuelve a ejecutar autenticación, RBAC, TenantContext, RLS, validaciones y reglas de dominio; una operación válida cuando se creó localmente puede ser rechazada al reconectar si el estado server cambió.
# Alcance offline MVP
Permitido en cola/draft:
- crear/editar borrador de recepción;
- capturar datos mínimos de cliente/vehículo necesarios para esa recepción;
- checklist, daños, observaciones y evidencia pendiente;
- IDs generados localmente cuando el modelo lo permita.
**Requieren servidor/online en MVP:**
- autorización/rechazo de cotización del cliente;
- confirmación/reverso de customer payments;
- cambios de roles/memberships/owner;
- transiciones de negocio sensibles que requieren estado server actual;
- billing Wompi;
- acciones administrativas y de privacidad de alto impacto.
# Sync Engine
Estados locales baseline:
```text
queued -> syncing -> applied
                  -> conflict
                  -> retryable_error
                  -> permanent_error
```
Reglas:
- retry exponencial/backoff para fallas transitorias;
- `UNIQUE(tenant_id, operation_id)` en `sync_operations` evita doble aplicación;
- operaciones append-only/evidencia pueden fusionarse cuando no existe conflicto semántico;
- registros mutables sensibles llevan versión/base_version; si server cambió, se devuelve conflicto explícito en vez de last-write-wins silencioso;
- el usuario ve pendiente/sincronizando/sincronizado/conflicto/error;
- al abrir la app y al recuperar conectividad se intenta sincronizar en foreground.
# Background Sync
Background Sync se usa únicamente como optimización cuando el navegador lo soporte. **No es dependencia de corrección**, porque no está disponible de forma uniforme en todos los navegadores.
El flujo obligatorio siempre funciona mediante:
```text
app open / focus / online event
        ↓
procesar sync_queue
```
# Media offline y límites de almacenamiento
IndexedDB puede almacenar BLOBs, pero las cuotas y reglas de evicción dependen del navegador/dispositivo. El usuario además puede borrar almacenamiento local en cualquier momento.
Baseline:
- datos estructurados y cola: IndexedDB;
- media offline se accede mediante una abstracción `LocalMediaStore`; puede usar Blob/IndexedDB u otro storage origin-private soportado sin cambiar este ADR;
- antes de capturar media grande se consulta `navigator.storage.estimate()` y se intenta `navigator.storage.persist()` donde exista;
- si no hay espacio suficiente/persistencia razonable, ILVOX **no promete guardar un video360 grande offline**: conserva la recepción y muestra que la evidencia debe capturarse/subirse al recuperar conectividad;
- nunca borrar silenciosamente una recepción local no sincronizada para liberar cuota;
- una vez sincronizada y confirmada por servidor, la copia local de negocio/media se elimina según TTL local corto.
# Seguridad local
- IndexedDB no se considera almacenamiento de secretos permanentes;
- no guardar tokens de proveedor, claves privadas, OTP ni credenciales de backend;
- minimizar PII en drafts offline;
- cierre de sesión con operaciones pendientes debe advertir al usuario; no se destruye una cola no sincronizada sin una decisión explícita y segura;
- después de sync confirmado se purga información local que ya no sea necesaria.
# Conflictos
Baseline:
- append-only compatible -\> merge;
- mismo recurso mutable con versión server distinta -\> `conflict`;
- el servidor devuelve versión/estado seguro necesario para resolver;
- no existe resolución automática que sobreescriba una acción terminal, autorización, pago o cambio de seguridad.
# Consecuencias
Ventajas:
- recepción tolera Internet malo;
- no requiere app móvil nativa en MVP;
- una sola base de código web/PWA;
- idempotencia server-side hace recuperables reintentos/cierres de app.
Costos/riesgos:
- storage browser varía por plataforma;
- Background Sync no es universal;
- media grande offline requiere control de cuota y UX explícita;
- sync/conflict añade complejidad y exige E2E con pérdida real de red.
# Quality Gate
- [ ] Recepción creada totalmente offline sobrevive cierre/reapertura de la PWA.
- [ ] Reconexión aplica la operación exactamente una vez.
- [ ] Repetir el mismo `operation_id` no duplica entidad/efecto.
- [ ] Conflicto server no se resuelve por overwrite silencioso.
- [ ] RBAC/RLS/guards se vuelven a evaluar al sincronizar.
- [ ] Logout con cola pendiente no destruye datos silenciosamente.
- [ ] QuotaExceeded/storage pressure se maneja con error visible y sin corrupción.
- [ ] Media grande sin cuota suficiente no se promete como guardada.
- [ ] Background Sync ausente no rompe la sincronización foreground.
- [ ] Tenant A nunca sincroniza una operación contra Tenant B.
# Referencias de plataforma
- MDN Storage quotas and eviction criteria.
- MDN Background Synchronization API — disponibilidad limitada.
- [web.dev](http://web.dev) PWA Offline data — IndexedDB/StorageManager y persistencia.

# 9. Offline y sincronización
**ADR canónico aceptado:** [ADR-005 — PWA + IndexedDB para operación offline](https://app.notion.com/p/3e06ab0a330d81a58a05dabdf042f145).
La recepción es el caso offline prioritario. IndexedDB mantiene drafts estructurados y `sync_queue`; PostgreSQL sigue siendo la única fuente de verdad. Background Sync es una optimización opcional, no dependencia de corrección, y las operaciones sensibles (autorizaciones, pagos confirmados/reversos, roles/ownership y otras transiciones server-authoritative) requieren servidor.
```text
PWA
 ├─ IndexedDB
 │   ├─ clientes temporales
 │   ├─ vehículos temporales
 │   ├─ recepción
 │   └─ sync_queue
 │
 └─ Sync Engine
      ├─ online → enviar pendientes
      ├─ retry con backoff
      ├─ idempotency_key
      └─ resolución de conflictos
```
### Reglas de sincronización
- IDs pueden generarse en cliente para operaciones offline.
- Cada mutación lleva `operation_id`/`idempotency_key` único.
- El servidor registra operaciones ya aplicadas.
- Operaciones append-only, como evidencias y observaciones, se fusionan.
- Ediciones concurrentes sensibles utilizan `version`/`updated_at` y rechazo explícito del conflicto.
- El usuario debe ver: **pendiente**, **sincronizando**, **sincronizado**, **error**.
- Video/fotos pueden quedar pendientes hasta recuperar conectividad sin impedir guardar la recepción local.
- **CRM Sprint 2 (S2-02):** `customers`, `vehicles` y `vehicle_owners` se crean online con UUIDv7 generado por el servidor; no hay `Idempotency-Key` ni IDs de cliente en CRM (D-22, diferido: Sprint 3 si el E2E móvil demuestra la necesidad; si no, Sprint 13 con `sync_operations.operation_id`). Los PATCH CRM exigen `expectedUpdatedAt` (§13.4), reutilizable como `base_version`.

