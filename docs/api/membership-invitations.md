# Invitaciones internas

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

---

## 13.1 Invitaciones internas (S1-04) — contrato backend ↔ PWA
```text
POST /api/v1/membership-invitations              tenant route: memberships.invite_staff + roles.assign_{owner|admin|staff}
GET  /api/v1/membership-invitations              tenant route: memberships.read
POST /api/v1/membership-invitations/:id/revoke   tenant route: memberships.manage_staff (+ permiso de asignar el rol)
POST /api/v1/membership-invitations/accept       identity-only: sesión Clerk verificada + email PRIMARIO verificado; body {"token": "<43 chars base64url>"}
```
- **Aceptación identity-only:** el invitado aún no tiene membership ni TenantContext; tenant y rol salen de la invitación resuelta por hash exacto (ADR-009 §7.8), nunca del body/headers. El email primario verificado de Clerk debe ser igual (forma canónica) a `email_normalized`.
- **Link del correo:** `<MEMBERSHIP_INVITATION_ACCEPT_URL>#token=<token>` — el token viaja **solo en el fragmento**: el navegador no lo envía al host de la PWA (logs de CDN/hosting) ni en `Referer`. La PWA lo lee client-side, lo retira de la URL (`history.replaceState`) y lo envía en el body del POST `/accept`. Nunca en path ni query.
- **Errores estables** (`{ error: { code, message, request_id } }`): `INVITATION_ALREADY_PENDING` 409, `INVITATION_ROLE_NOT_ALLOWED` 403 (auditado, commit durable), `INVITATION_NOT_FOUND` 404, `INVITATION_INVALID` 404, `INVITATION_EXPIRED` 410, `INVITATION_REVOKED` 410, `INVITATION_ALREADY_ACCEPTED` 409, `INVITATION_EMAIL_MISMATCH` 403 (auditado), `MEMBERSHIP_ALREADY_EXISTS` 409, `INVITATION_IN_PROGRESS` 409 (**reintentar**: lock ocupado o envío de correo en curso; nada se confirmó).



- **Pendiente (DECISION_REQUIRED, sin cambio en S1-04):** reactivar memberships `suspended/revoked` vía invitación (hoy 409 `MEMBERSHIP_ALREADY_EXISTS`); admin revocando invitaciones owner/admin (hoy denegado); pérdida de permiso del invitador antes de la aceptación (autorización capturada al crear); taller `suspended/cancelled` (sin gate); comando de reenvío (no existe); contrato `Idempotency-Key` del create.
