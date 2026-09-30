# ERD seleccionado para frontend

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🗃️ Modelo de Datos / ERD v1 — PostgreSQL](https://app.notion.com/p/3df6ab0a330d81fda465f8944c3291e6?pvs=204) · última edición: 2026-09-29T22:45:02.267Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Se omiten roles PostgreSQL, índices, DDL y secuencias de migraciones. Es una referencia de relaciones de producto, no una interfaz de acceso a datos.

---

# # 2. Dominios y tablas
<table fit-page-width="true" header-row="true">
<tr>
<td>Dominio</td>
<td>Tablas principales</td>
</tr>
<tr>
<td>Tenancy e identidad</td>
<td>workshops, workshop_locations, users, identity_sync_states, memberships, membership_invitations, membership_invitation_deliveries, roles, permissions, role_permissions, membership_roles</td>
</tr>
<tr>
<td>CRM</td>
<td>customers, vehicles, vehicle_owners</td>
</tr>
<tr>
<td>Agenda</td>
<td>appointments, reminders</td>
</tr>
<tr>
<td>Recepción</td>
<td>receptions, reception_check_items, vehicle_damages, signatures</td>
</tr>
<tr>
<td>Órdenes</td>
<td>service_orders, service_order_items, order_status_history, assignments</td>
</tr>
<tr>
<td>Diagnóstico</td>
<td>diagnostics, findings, recommendations</td>
</tr>
<tr>
<td>Catálogo</td>
<td>catalog_items</td>
</tr>
<tr>
<td>Inventario</td>
<td>inventory_balances, inventory_movements</td>
</tr>
<tr>
<td>Cotizaciones</td>
<td>quotes, quote_versions, quote_items, quote_authorization_tokens, quote_authorization_challenges, quote_authorizations, quote_authorization_items</td>
</tr>
<tr>
<td>Operación</td>
<td>work_activities, technician_logs, quality_checks, deliveries</td>
</tr>
<tr>
<td>Archivos</td>
<td>media_assets, upload_sessions, reception_media, damage_media, finding_media, work_activity_media, quality_check_media, delivery_media, quote_media</td>
</tr>
<tr>
<td>Comunicaciones / acceso cliente</td>
<td>tenant_whatsapp_accounts, message_threads, messages, customer_order_access_tokens</td>
</tr>
<tr>
<td>Billing SaaS</td>
<td>plans, subscriptions, billing_events, payments</td>
</tr>
<tr>
<td>Pagos operativos</td>
<td>customer_payments, customer_payment_allocations, customer_payment_reconciliation_runs</td>
</tr>
<tr>
<td>Privacidad / Habeas Data</td>
<td>privacy_consents, data_subject_requests, privacy_security_incidents, legal_acceptances</td>
</tr>
<tr>
<td>Plataforma</td>
<td>outbox_events, webhook_events, webhook_processing_attempts, sync_operations, audit_logs, feature_flags</td>
</tr>
</table>

## Uso desde frontend

Esta selección conserva el inventario por dominio. Los campos y relaciones útiles están en los seis archivos de data-dictionary/ y los requests en ../api/. Para el ERD completo, seguir la URL de origen indicada arriba.

No trasladar a componentes las policies RLS, roles PostgreSQL, índices ni DDL. Nunca serializar una fila SQL completa para construir un DTO.

## Relaciones del flujo operativo

- Workshop → memberships → roles/permisos.
- Workshop → customers; vehicles mantienen historial de propietarios mediante vehicle_owners.
- Reception → vehicle + propietario vigente + consentimiento service_provision + checklist/daños/firma.
- Reception → service_order; order → assignments, diagnóstico, versiones de cotización, reparación, calidad y entrega.
- Media se enlaza por relaciones específicas de dominio; no inventar media_links polimórfico.
- Quote_version → ítems y autorización sobre esa versión exacta; evidencia previa se conserva.
- Customer_payments son pagos del vehículo al taller; subscriptions/payments son billing SaaS.
- Inventory_movements son el ledger; inventory_balances es una proyección y la UI no escribe stock directamente.
- Customer_order_access_tokens habilitan el DTO público de una orden sin membership.

Estas relaciones son una síntesis editorial del ERD; no son schemas HTTP.

