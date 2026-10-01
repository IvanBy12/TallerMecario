# Convenciones API y errores seguros

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.
- Fuente: [⚙️ Operación, Retención, Recuperación y Observabilidad v1 — TallerMecario](https://app.notion.com/p/3e06ab0a330d819ea376f6f7628679f6?pvs=204) · última edición: 2026-09-28T14:28:21.555Z.
- Fuente: [🔄 Estados y Transiciones por Dominio v1](https://app.notion.com/p/3e06ab0a330d819080edfe450a75a7f5?pvs=204) · última edición: 2026-09-19T17:43:13.530Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

La lista de rutas generales es baseline documental; no prueba endpoints desplegados. Contratos específicos S1/S2 prevalecen sobre convenciones genéricas, por ejemplo CRM sin idempotencia y validación 400.

---

# 13. API y contratos
Base: `/api/v1`.
Convenciones:
```text
POST   /api/v1/membership-invitations
POST   /api/v1/membership-invitations/accept
POST   /api/v1/customers
GET    /api/v1/customers/:id
GET    /api/v1/customers
PATCH  /api/v1/customers/:id
POST   /api/v1/vehicles
GET    /api/v1/vehicles
GET    /api/v1/vehicles/:id
PATCH  /api/v1/vehicles/:id
GET    /api/v1/vehicles/:id/owners
POST   /api/v1/vehicles/:id/owners
POST   /api/v1/receptions
POST   /api/v1/orders/:id/diagnostics
POST   /api/v1/orders/:id/quotes
POST   /api/v1/quotes/:id/send
POST   /api/v1/quotes/:id/authorizations/manual
GET    /api/v1/public/quotes/authorization/:token
POST   /api/v1/public/quotes/authorization/:token/challenges
POST   /api/v1/public/quotes/authorization/:token/challenges/:challengeId/verify
POST   /api/v1/public/quotes/authorization/:token/decision
GET    /api/v1/public/orders/:token
POST   /api/v1/media/upload-sessions
POST   /api/v1/webhooks/wompi
POST   /api/v1/webhooks/whatsapp
```
- JSON consistente.
- Validación estricta de payload.
- Errores con código de aplicación estable, `request_id` y mensaje seguro.
- `Idempotency-Key` en operaciones sensibles.
- Paginación cursor-based donde el volumen lo justifique. Formato (S2-02): cursor opaco base64url versionado; `limit` 20 por defecto y 100 máximo; respuesta `{ <items>, nextCursor }` con `nextCursor = null` al final; cursor o `limit` inválidos → 400 `REQUEST_VALIDATION_FAILED`. Cada listado define su orden estable en su contrato.
- Versionamiento de API antes de comercialización.


## 6.7 Error contract
Errores de aplicación usan código estable:
```json
{
  "error": {
    "code": "DOMAIN_PRECONDITION_FAILED",
    "message": "Safe client message",
    "request_id": "..."
  }
}
```
Stack trace y detalles SQL solo en telemetría protegida tras minimizar/redactar; nunca en respuesta production. JWT, tokens y secretos (incluidos los del proveedor) nunca se registran, tampoco en diagnósticos internos.


# 9. Errores de transición
Contrato sugerido:
```text
409 DOMAIN_INVALID_STATE_TRANSITION
403 DOMAIN_ACTION_FORBIDDEN
422 DOMAIN_PRECONDITION_FAILED
```
La respuesta segura puede incluir `current_state`, `requested_action` y `request_id`, pero no detalles internos sensibles.

