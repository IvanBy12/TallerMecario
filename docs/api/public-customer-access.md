# Acceso público y autorización de cotización

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🔌 Contratos Externos — Wompi + WhatsApp v1](https://app.notion.com/p/3e06ab0a330d814aaa72e80f2a7c7f10?pvs=204) · última edición: 2026-09-19T04:19:26.899Z.
- Fuente: [3️⃣ Diccionario 03 — Media, Comunicaciones, Billing y Pagos](https://app.notion.com/p/3e06ab0a330d8110981af4b11ce837e0?pvs=204) · última edición: 2026-09-19T05:33:15.729Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Contexto futuro: el cliente final no tiene user/membership interno; seguimiento y autorización usan credenciales distintas. Un token de seguimiento no habilita aprobación.

---

## 6.1 Flujo público de autorización de cotización
Endpoints ILVOX:
```text
GET  /api/v1/public/quotes/authorization/:token
POST /api/v1/public/quotes/authorization/:token/challenges
POST /api/v1/public/quotes/authorization/:token/challenges/:challengeId/verify
POST /api/v1/public/quotes/authorization/:token/decision
```
`GET` valida hash/estado/expiración/version current y devuelve únicamente el DTO público necesario para decidir; **no consume** el token y no exige OTP.
`POST .../challenges` solicita OTP on-demand. El servidor valida token + rate limits y crea `quote_authorization_challenges.status='requested'`; el worker materializa y envía el código por la WABA del mismo tenant.
`POST .../verify` valida el OTP contra `code_hash`, incrementa `attempt_count` de forma segura y pasa a `verified` solo si challenge/token siguen vigentes.
`POST .../decision` recibe una decisión limitada (`approved | partially_approved | rejected`), `challenge_id` verificado y, para aprobación parcial, líneas/cantidades permitidas. En una única transacción debe:
1. bloquear/validar `quote_authorization_tokens` y `quote_authorization_challenges`;
2. comprobar token `active`, expiración, tenant/version/current quote y challenge `verified` no expirado del mismo token;
3. insertar `quote_authorizations` + `quote_authorization_items` append-only conservando `authorization_token_id` y `authorization_challenge_id` exactos;
4. marcar challenge y token usados como `consumed`;
5. marcar tokens hermanos activos de la misma versión como `superseded`;
6. transicionar quote y service_order mediante comandos válidos;
7. emitir audit/outbox requerido.
Una carrera entre dos tokens válidos de la misma versión solo puede cerrar una decisión; la transacción perdedora recibe conflicto/credencial ya supersedida.
## 6.2 OTP on-demand — contrato interno
Solicitud outbox (sin código crudo):
```json
{
  "event_type": "communication.quote_authorization_otp_requested",
  "event_version": 1,
  "tenant_id": "uuid",
  "authorization_token_id": "uuid",
  "challenge_id": "uuid",
  "whatsapp_account_id": "uuid",
  "recipient": "573001234567",
  "template_key": "quote_authorization_otp",
  "requested_at": "2026-09-19T03:00:00Z"
}
```
Worker:
```text
lock challenge requested
  ↓
CSPRNG 6 dígitos
  ↓
guardar code_hash + expires_at(5 min)
  ↓
enviar plantilla Authentication por WABA del tenant
  ↓
raw OTP desaparece de memoria tras request
```
Reglas baseline:
- 6 dígitos, CSPRNG;
- TTL 5 minutos;
- máximo 5 intentos;
- cooldown de reenvío 60 segundos;
- nuevo challenge supersede el anterior utilizable;
- raw OTP nunca aparece en DB/outbox/logs;
- costo del mensaje OTP corresponde a la WABA del taller, no al billing Wompi de ILVOX;
- mismo canal WhatsApp protege contra filtración aislada del link, no contra compromiso total de la cuenta WhatsApp del cliente.


# 7. customer_order_access_tokens
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
order_id | uuid | NOT NULL | composite FK service_orders |
token_hash | varchar(128) | NOT NULL | UNIQUE | raw token never persisted
access_scope | varchar(24) | NOT NULL | CHECK order_tracking|delivery_summary |
status | varchar(16) | NOT NULL DEFAULT active | CHECK active|revoked |
expires_at | timestamptz | NOT NULL | - | baseline created_at + 30 días
created_by_membership_id | uuid | NOT NULL | composite FK memberships |
revoked_at | timestamptz | NULL | - |
revoked_by_membership_id | uuid | NULL | composite FK memberships |
revoke_reason | text | NULL | - |
last_accessed_at | timestamptz | NULL | telemetry only |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Seguridad valida `active AND expires_at>now()`. Token reusable durante vigencia para lectura limitada; revocable anticipadamente.

