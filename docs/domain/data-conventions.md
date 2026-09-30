# Convenciones y mutabilidad del dominio

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [📚 Diccionario de Datos v1 — PostgreSQL](https://app.notion.com/p/3e06ab0a330d815fbb32e6200f8d5417?pvs=204) · última edición: 2026-09-26T02:22:11.148Z.
- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Los nombres de columnas SQL son referencia del dominio. Los DTO HTTP son la autoridad del frontend; no derivar automáticamente payloads desde tablas.

---

# 1. Convenciones
- PK de entidades: `uuid NOT NULL`; UUID/UUIDv7 generado por aplicación. No usar `serial`/IDs globales secuenciales como autoridad.
- Toda tabla tenant-owned lleva `tenant_id uuid NOT NULL` y `UNIQUE(tenant_id,id)` cuando necesita ser padre de FK compuesta.
- Fechas: `timestamptz` UTC.
- Dinero: `bigint` en unidad mínima; `currency char(3)` ISO-4217.
- Cantidades: `numeric(14,4)` y `> 0` cuando representan una cantidad real.
- Tasas porcentuales: `numeric(7,4)` expresada en puntos porcentuales (`19.0000 = 19%`) con `0 <= rate <= 100`.
- Texto libre largo: `text`; códigos/estados: `varchar` con CHECK explícito cuando el conjunto es cerrado.
- `created_at` no se modifica. `updated_at` solo existe en entidades mutables.
- Campos `tenant_id`, actor/ownership, estados y valores derivados son server-owned salvo flujo offline explícitamente autorizado.
- FKs tenant-owned usan `(tenant_id,fk_id)`; cada FK compuesta tiene índice equivalente en la hija.
- Borrado físico deny-by-default. Históricos/evidencias son append-only para runtime.
- `ON DELETE CASCADE` no se usa desde entidades de negocio hacia históricos/evidencias. Solo puede usarse en tablas puramente asociativas/configurativas sin valor histórico y si el diccionario lo autoriza.

# 2. Semántica de mutabilidad
- **Mutable:** UPDATE por comandos de dominio autorizados.
- **Frozen-on-send/confirm/complete:** mutable hasta evento indicado; luego campos protegidos no cambian.
- **Append-only:** runtime puede INSERT/SELECT, no UPDATE/DELETE/TRUNCATE.
- **Derived:** no es fuente de verdad; debe reconstruirse/reconciliarse desde ledger/estado canónico.
- **Frozen-on-close:** fila de historial con vigencia. Mientras está abierta, solo su timestamp de cierre puede pasar de NULL a un valor válido y los demás campos no cambian. Una vez cerrada es inmutable, incluidas las reescrituras con el mismo valor y las reaperturas. Los cambios se representan cerrando e insertando. Aplica a `vehicle_owners` (Diccionario 01 §12; S2-02).

# 3. Integridad que se cierra en este diccionario
- `service_order_items` prueba por FK que un `quote_item_id` pertenece a la **misma orden**.
- En ítems provenientes de cotización, `service_order_items.catalog_item_id` copia la identidad de `quote_items.catalog_item_id` cuando exista para soportar inventario; snapshots de nombre/precio/impuesto/garantía siguen siendo la autoridad histórica y evitan que cambios futuros del catálogo alteren la orden.
- `quote_authorization_items` lleva `quote_version_id` y prueba por FK que autorización e ítem pertenecen a la misma versión.
- `service_order_items.quantity_billed` separa lo ejecutado de lo finalmente facturable; `line_total` usa cantidad facturada.
- Garantía de orden conserva `warranty_origin` y motivos de ajuste/cancelación.
- TTL baseline: invitación 7 días; link de autorización de cotización 72 h; OTP 5 min; seguimiento público de orden 30 días (todos pueden revocarse antes y la validación siempre compara `expires_at`).
- Feature flag `value_json` tiene semántica **replace por scope**, no deep-merge entre tenant/plan/global.


# 6. Dominios y modelo de datos

| Dominio | Entidades principales |
| --- | --- |
| Identidad | users, workshops, memberships, membership_invitations, roles, permissions |
| CRM | customers, vehicles, vehicle_owners |
| Recepción | receptions, reception_check_items, vehicle_damages, signatures |
| Archivos | media_assets, upload_sessions, reception_media, damage_media, finding_media, work_activity_media, quality_check_media, delivery_media, quote_media |
| Órdenes | service_orders, service_order_items, order_status_history, assignments |
| Diagnóstico | diagnostics, findings, recommendations |
| Catálogo | catalog_items |
| Inventario / analítica comercial | inventory_balances, inventory_movements + dashboard derivado |
| Cotización | quotes, quote_versions, quote_items, quote_authorization_tokens, quote_authorization_challenges, quote_authorizations, quote_authorization_items |
| Operación | work_activities, technician_logs, quality_checks, deliveries |
| Agenda | appointments, reminders |
| Comunicaciones / acceso cliente | tenant_whatsapp_accounts, message_threads, messages, customer_order_access_tokens |
| Billing SaaS | plans, subscriptions, billing_events, payments |
| Pagos operativos | customer_payments, customer_payment_allocations, customer_payment_reconciliation_runs |
| Privacidad / cumplimiento | privacy_consents, data_subject_requests, privacy_security_incidents, legal_acceptances |
| Plataforma | audit_logs, webhook_events, outbox_events, sync_operations, feature_flags |

## Convenciones de datos
**Contrato canónico de columnas/tipos:** [Diccionario de Datos v1 — PostgreSQL](https://app.notion.com/p/3e06ab0a330d815fbb32e6200f8d5417).
- PK: UUID/UUIDv7 o identificador equivalente generado por aplicación.
- Fechas: `timestamptz` en UTC.
- Dinero: entero en unidad mínima o `numeric`, nunca `float`.
- Estados: CHECK/enum controlado + máquina de estados en dominio.
- Soft delete solo cuando exista necesidad de negocio; auditoría no sustituye integridad referencial.
- Campos mínimos de trazabilidad: `created_at`, `updated_at`, `created_by`, cuando aplique.

