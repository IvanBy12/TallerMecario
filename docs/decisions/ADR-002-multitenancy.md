# 🏢 ADR-002 — Multitenancy pooled con PostgreSQL compartido + tenant_id

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🏢 ADR-002 — Multitenancy pooled con PostgreSQL compartido + tenant_id](https://app.notion.com/p/3e06ab0a330d81e09488cfddd222efdc?pvs=204) · última edición: 2026-09-19T05:08:19.558Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Referencia de decisión; no incluir secretos ni activar la integración por la sola existencia del ADR.

---

**Decisión:** talleres comparten instancia/base/schema PostgreSQL y las entidades tenant-owned llevan `tenant_id`.

**Estado:** Aceptada  
**Fecha:** 2026-09-19
# Contexto
El MVP necesita bajo costo operativo y onboarding rápido de talleres sin aprovisionar una base por cliente.
# Decisión
- modelo pooled/shared schema;
- `tenant_id` obligatorio en recursos del taller;
- FKs compuestas tenant-safe;
- TenantContext server-side;
- RLS como defensa adicional según ADR-009;
- unicidades locales incluyen tenant;
- RBAC se resuelve por membership del tenant.
# Alternativas diferidas
Database-per-tenant y schema-per-tenant se reevaluarán solo por exigencia enterprise/regulatoria, aislamiento contractual o escala operativa demostrada.
# Consecuencias
Mayor eficiencia de costo y operación; el riesgo principal es fuga cross-tenant, por lo que aislamiento DB + API forma parte de cada Gate.
# Quality Gate
- A→B rechazado en PostgreSQL;
- RLS/roles runtime correctos;
- API también rechaza acceso cruzado;
- backups/restore conservan aislamiento.
