# 💬 ADR-008 — WhatsApp por tenant con WABA propia y facturación directa Meta

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [💬 ADR-008 — WhatsApp por tenant con WABA propia y facturación directa Meta](https://app.notion.com/p/3e06ab0a330d8108ae45e0e053e7675b?pvs=204) · última edición: 2026-09-19T04:35:59.430Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Referencia de decisión; no incluir secretos ni activar la integración por la sola existencia del ADR.

---

**Decisión:** en MVP/piloto cada taller conecta y conserva su propia cuenta/número de WhatsApp Business (WABA). Meta factura el consumo de WhatsApp directamente al taller. ILVOX actúa como plataforma técnica autorizada y no centraliza ni refactura ese consumo.

**Estado:** Aceptada  
**Fecha:** 2026-09-18  
**Ámbito:** WhatsApp Cloud API, onboarding de integraciones, billing, multitenancy y seguridad.
# Contexto
ILVOX es un SaaS multiempresa. El billing de ILVOX ya está separado en tres flujos:
1. taller -\> ILVOX: suscripción SaaS mediante Wompi;
2. cliente final -\> taller: pagos operativos;
3. comunicaciones WhatsApp: consumo del canal Meta.
Centralizar el consumo de todos los talleres bajo una línea de crédito/cuenta de ILVOX obligaría a medir, conciliar, refacturar y asumir riesgo de mora de terceros. Para un piloto de 5–20 talleres no es proporcional.
# Decisión
- Cada tenant conecta su propia WABA/número mediante el mecanismo de onboarding soportado por Meta (baseline: Embedded Signup o flujo equivalente vigente).
- La WABA, el número y la relación comercial/facturación con Meta pertenecen al taller.
- `billing_mode = tenant_direct` en MVP.
- ILVOX no usa Wompi para cobrar consumo de WhatsApp.
- ILVOX no comparte una línea de crédito propia con talleres en MVP.
- La Meta App puede ser de ILVOX, pero el contexto operativo de envío se resuelve por tenant hacia la cuenta/número que ese taller autorizó.
- Desconectar/cancelar ILVOX revoca la integración de ILVOX; no transfiere propiedad del número/WABA.
# Flujo
```text
Taller
  ├─ paga SaaS -> Wompi -> ILVOX
  └─ paga WhatsApp -> Meta

Cliente final
  └─ paga reparación -> Taller
```
# Consecuencias técnicas
- Crear `tenant_whatsapp_accounts` como configuración tenant-owned.
- Resolver outbound: `TenantContext -> tenant_whatsapp_accounts(active) -> phone_number_id/WABA -> credential secret ref -> Meta`.
- Resolver inbound por `phone_number_id` contra configuración server-side única; nunca aceptar `tenant_id` del webhook como autoridad.
- Material de acceso sensible vive en secret store; PostgreSQL conserva únicamente una referencia opaca al secreto cuando sea necesario.
- Baseline: máximo una integración WhatsApp activa por tenant; el diseño puede admitir múltiples números en una evolución posterior.
- Feature flags/RBAC siguen controlando si el taller puede usar la capacidad aunque su WABA esté conectada.
# OTP de autorización
El OTP on-demand para autorizar/rechazar cotizaciones utiliza la WABA del mismo tenant. El costo del mensaje de autenticación es consumo Meta del taller, no billing SaaS de ILVOX.
# Alternativa descartada para MVP
**ILVOX paga Meta y refactura consumo a cada taller.** Se difiere por complejidad financiera/operativa: credit line, medición, conciliación, impuestos, límites, mora, reembolsos y riesgo de impago. Puede reevaluarse con escala comercial suficiente.
# Momento correcto para Meta App / App Review
Esta decisión **no obliga a tener ahora una Meta App aprobada ni Embedded Signup funcional**. El proyecto está en Sprint 0 documentación-first y App Review no bloquea esta fase.
Secuencia acordada:
```text
Sprint 0
Documentación solamente
    ↓
Desarrollo base ILVOX
    ↓
Sprint 9 / WhatsApp
Crear o completar Meta App Business
Cloud API con activos/número de prueba
Webhook staging
Templates + OTP
    ↓
Embedded Signup mínimo demostrable
    ↓
Solicitar App Review / Advanced Access
    ↓
Antes de Sprint 15 piloto
Conectar WABAs reales de talleres
```
No solicitar App Review mientras ILVOX no tenga un flujo mínimo demostrable. Tampoco construir una maqueta artificial únicamente para la revisión. La revisión debe iniciarse cuando Cloud API, webhook y onboarding mínimo puedan demostrarse en staging, dejando margen antes del piloto real.
**Dependencia de release:** App Review/Advanced Access de Meta no bloquea Sprint 0, pero sí debe estar resuelto antes de conectar cuentas/WABAs de talleres reales en piloto/producción.
# Criterios de salida
- Dos tenants conectados no comparten `phone_number_id`, WABA ni credencial operativa.
- Un webhook de WABA A nunca puede resolver tenant B.
- Desconectar A no afecta B.
- Facturación WhatsApp no crea `payments`/`billing_events` de SaaS.
- Wompi continúa siendo exclusivamente taller -\> ILVOX.
