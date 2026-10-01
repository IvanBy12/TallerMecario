# Roadmap y alcance de Sprint 3

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [Metodologia Scrum 2 week  + Gates (RoadMap)](https://app.notion.com/p/3de6ab0a330d80cc94e0dc6f270efdf0?pvs=204) · última edición: 2026-09-20T00:51:26.521Z.
- Fuente: [🚦 Quality Gates — Reglas y Pruebas por Sprint](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573?pvs=204) · última edición: 2026-09-29T22:45:08.831Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

La división Track A/Track B procede del plan de esta conversación. Notion conserva el roadmap original: recepción S3, media S4 y sincronización completa S13. Ver ../OPEN-QUESTIONS.md antes de ampliar el gate de Track B.

---


| Sprint | Objetivo | Resultado obligatorio |
| --- | --- | --- |
| **Sprint 0** | Arquitectura y proyecto | Base técnica lista |
| **Sprint 1** | Multiempresa + autenticación | Taller puede ingresar |
| **Sprint 2** | Clientes + vehículos | CRUD completo |
| **Sprint 3** | Recepción del vehículo | Ingreso completo |
| **Sprint 4** | Video 360° + evidencias | Archivos funcionando |
| **Sprint 5** | Órdenes de trabajo | Flujo operativo |
| **Sprint 6** | Diagnóstico | Hallazgos y evidencias |
| **Sprint 7** | Cotizaciones + catálogo | Versionamiento, PDF y maestro de productos/servicios |
| **Sprint 8** | Autorización cliente | Aprobar/rechazar |
| **Sprint 9** | WhatsApp | Mensajería real |
| **Sprint 10** | Reparación + estados + inventario | Operación, consumo de repuestos y stock |
| **Sprint 11** | Entrega + historial + dashboard | Ciclo cerrado + métricas owner/admin |
| **Sprint 12** | Wompi + suscripciones | Billing funcionando |
| **Sprint 13** | Offline + sincronización | Tolerancia a Internet malo |
| **Sprint 14** | Seguridad + hardening | Producto preparado |
| **Sprint 15** | Piloto real | Talleres reales |
| **Sprint 16** | Release comercial | Producto vendible |

**Dependencia Meta/WhatsApp:** Sprint 0 no requiere Meta App aprobada ni App Review. En Sprint 9 se prepara Cloud API con activos de prueba, webhook staging, templates y OTP; cuando exista un Embedded Signup mínimo demostrable se solicita App Review/Advanced Access. La aprobación debe quedar lista antes de Sprint 15 para conectar WABAs reales de talleres. Ver [.


<page url="https://app.notion.com/p/3de6ab0a330d807faf46ce81d957ecba">Sprint 0 Backlog](https://app.notion.com/p/3e06ab0a330d8108ae45e0e053e7675b)
[Quality Gates — Reglas y Pruebas por Sprint](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573)

# 6. Sprint 3 — Recepción
- [ ] Buscar placa.
- [ ] Crear cliente/vehículo si no existe.
- [ ] Kilometraje.
- [ ] Combustible 0–100.
- [ ] Checklist.
- [ ] Daños existentes.
- [ ] Observaciones.
- [ ] Firma.
- [ ] CHECK XOR de firma.
- [ ] D-SIG-01: `UNIQUE(tenant_id, signature_media_id)` impide reutilizar una misma captura de firma entre dos filas de `signatures`, incluso entre recepción y entrega; cada acto de firma requiere media distinta.
- [ ] Una media ya firmada puede pasar `active → quarantined` sin borrar ni reescribir la firma; la cuarentena conserva evidencia histórica y bloquea signed URLs/acceso normal mientras el medio no esté `active`.
- [ ] Quarantine-first: la firma sobre media ya cuarentenada falla sin insertar firma ni auditoría de éxito. Signature-first: la firma persiste y la cuarentena posterior tiene éxito.
- [ ] Crear recepción sin consentimiento `service_provision` es rechazado y no permite captura de fotos, video ni firma.
- [ ] Taller sin aviso de privacidad configurado no puede crear recepciones.
- [ ] La recepción guarda `privacy_consent_id`; PostgreSQL rechaza un consentimiento de otro tenant, de otro customer o de otra finalidad.
- [ ] Negarse a `marketing`, `image_use`, recordatorios o WhatsApp no bloquea la recepción y no queda premarcado.
- [ ] Revocar `service_provision` no borra datos de órdenes abiertas o en garantía y bloquea nuevas recepciones hasta una nueva autorización (nueva fila).
- [ ] Consentimiento guarda versión de aviso, versión de texto, `authorization_text_hash` (sha256 canónico calculado por el servidor), canal, `captured_at` y evidencia; una nueva autorización crea nueva fila.
- [ ] `authorization_text_hash` con formato inválido o ausente es rechazado por PostgreSQL.
- [ ] El consentimiento pertenece al `customer` que entrega el vehículo (el dueño); `received_by_membership_id` refleja a quien registra la recepción según RBAC.
- [ ] Consentimiento revocado (`status='revoked'` o `revoked_at` no nulo) → `createReception` es rechazado.
- [ ] `createReception` vs `revokeConsent` concurrentes se serializan: si la revocación gana, la recepción falla; si la recepción gana, es válida y la revocación ocurre después (lock `FOR SHARE` explícito, no solo el FK).
- [ ] Un `customer_id` distinto del propietario principal vigente del vehículo es rechazado.
- [ ] `createReception` vs cambio de propietario concurrentes se serializan sobre el lock del vehículo.
- [ ] Un `authorization_text_hash` enviado por el cliente es rechazado; el servidor lo calcula desde el catálogo versionado.
- [ ] Hash y versiones fijados por tests de hash conocido por cada versión publicada; una versión publicada no se modifica.
- [ ] Consentimiento con `created_at` posterior a la recepción es rechazado; `captured_at` no se usa como autoridad de ordenamiento.
- [ ] `controller_notice_snapshot` es NOT NULL, server-owned e inmutable tras el INSERT del consentimiento; un valor enviado por el cliente es rechazado.
- [ ] Con versiones + textos del catálogo + snapshot conservado se reconstruyen los mismos bytes y el mismo SHA-256, aunque el taller haya cambiado después su dirección o contacto; la codificación distingue explícitamente `NULL` de string vacío en campos nullable del snapshot.
- [ ] Sin `adultAttestationConfirmed = true` (ausente o `false`) no se crea consentimiento ni recepción; la declaración de mayoría de edad forma parte del texto canónico versionado y no se persiste fecha de nacimiento ni un booleano redundante.
- [ ] Offline: la recepción usa el `privacy_notice_bundle` entregado por el servidor y guardado íntegro en IndexedDB; al sincronizar se verifica HMAC-SHA256 (`key_version`) en tiempo constante sobre los bytes exactos del payload emitido por el backend, antes de interpretar el JSON; también se verifica tenant, formato, versión y vigencia.
- [ ] Un bundle alterado (texto, snapshot, tenant) o de otro tenant es rechazado; un hash o snapshot enviado fuera del bundle es rechazado.
- [ ] Tras validar el HMAC, los textos del bundle deben coincidir exactamente con el catálogo server-owned para `privacy_notice_version` y `authorization_text_version`; una versión publicada modificada/eliminada o un bundle con versión-texto incoherente es rechazado.
- [ ] El sync usa el snapshot del bundle verificado, no el estado actual de `workshops`.
- [ ] `createReception` toma `vehicles FOR NO KEY UPDATE` antes de validar el propietario. Con `transferOwner` concurrente: si `transferOwner` gana, el customer obsoleto es rechazado; si `createReception` gana, la recepción histórica permanece válida.
- [ ] Dos `createReception` concurrentes del mismo vehículo se serializan sobre `vehicles FOR NO KEY UPDATE`; si la primera deja una recepción abierta, la segunda termina en `RECEPTION_ALREADY_OPEN` por `receptions_one_open_vehicle_uq`.
- [ ] El trigger de respaldo de propietario toma `FOR NO KEY UPDATE` sobre `vehicles` antes de consultar `vehicle_owners`.
- [ ] INSERT SQL directo en `receptions` vs cambio de propietario concurrente: el trigger toma el lock del vehículo y no produce TOCTOU.
- [ ] Orden de locks al crear (vehículo → consentimiento → INSERT) y en PATCH/CLOSE (recepción → vehículo) no produce deadlock bajo concurrencia.
- [ ] Upgrade de migración fail closed: DB sin legacy incompatible → PASS; `reception` legacy sin consentimiento → FAIL + rollback completo; consentimiento legacy sin hash/snapshot reconstruible → FAIL + rollback completo; sin backfill ficticio.
- [ ] Cerrar recepción.
- [ ] Crear orden una sola vez.
- [ ] Historial.
- [ ] Tenant isolation.
- [ ] Idempotencia de cierre.
- [ ] E2E desde móvil.

# 7. Sprint 4 — Video 360° + evidencias
- [ ] `media_assets` conserva retention_class/retention_until/policy_version y estado de deletion/purge.
- [ ] Upload incompleto expira/purga según baseline 24 h.
- [ ] Media operacional calcula 12 meses desde orden terminal; warranty extiende hasta `warranty_expires_at + 90 días` cuando sea mayor.
- [ ] Firma/PDF/evidencia usa default de producto 36 meses salvo policy/hold superior.
- [ ] Legal hold evita purge automático.
- [ ] `deleted_at` bloquea nuevas signed URLs antes de `purged_at`.
- [ ] Worker de retención no borra media con vínculo/hold vigente y deja audit event.
- [ ] Scan detecta objeto R2 faltante y objeto huérfano sin metadata.
- [ ] Upload session.
- [ ] URL firmada temporal.
- [ ] Video cliente → R2 directo.
- [ ] Fotos.
- [ ] Reintento.
- [ ] Upload interrumpido.
- [ ] Archivo inválido rechazado.
- [ ] Metadata persistida.
- [ ] Checksum/tamaño cuando aplique.
- [ ] Enlaces media específicos por dominio.
- [ ] No media_links polimórfico en escritura.
- [ ] Media A no puede enlazar entidad B.
- [ ] URL de descarga expira.
- [ ] R2 caído no destruye recepción.
- [ ] Consulta/vista media por orden.
- [ ] E2E recepción + video + fotos.

# 16. Sprint 13 — Offline + sincronización
- [ ] Operación offline conforme ADR-005.
- [ ] Recepción/drafts estructurados viven en IndexedDB; PostgreSQL sigue siendo source of truth.
- [ ] Background Sync no es requisito: sin soporte, sync foreground al abrir/focus/online funciona.
- [ ] Storage quota se estima y `QuotaExceededError` no corrompe ni elimina silenciosamente recepción pendiente.
- [ ] `navigator.storage.persist()` se solicita/usa donde esté soportado, sin asumir que siempre será concedido.
- [ ] Media grande offline verifica cuota; si no hay espacio suficiente, UI no afirma que el video quedó guardado y permite conservar la recepción.
- [ ] Operaciones sensibles server-authoritative no se completan offline.
- [ ] IDs cliente cuando aplique.
- [ ] Cola IndexedDB.
- [ ] Reconexión sincroniza.
- [ ] operation_id/idempotency evita duplicados.
- [ ] Retry/backoff.
- [ ] Conflictos detectados por versión/base_version cuando corresponda.
- [ ] Conflicto no usa last-write-wins silencioso; operaciones terminales/pagos/autorizaciones nunca se sobrescriben automáticamente.
- [ ] Resolución aplicada y visible al usuario.
- [ ] Estados de sync visibles.
- [ ] Media pendiente no pierde recepción.
- [ ] `privacy_notice_bundle` offline: se implementa la política de expiración/grace definida en ADR-005; un bundle vencido fuera de esa política no autoriza una nueva recepción offline.
- [ ] La implementación offline conserva y reenvía el envelope original del bundle; no reserializa el payload antes de verificar el HMAC y mantiene disponibles las versiones publicadas que todavía puedan ser referenciadas por evidencia o bundles válidos.
- [ ] Tenant isolation tras sync.
- [ ] Cerrar/reabrir app conserva cola.
- [ ] Pérdida real de red durante recepción.
- [ ] E2E offline → online → consistencia.

