# 🎥 ADR-003 — Media directa a Cloudflare R2 mediante URLs firmadas

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🎥 ADR-003 — Media directa a Cloudflare R2 mediante URLs firmadas](https://app.notion.com/p/3e06ab0a330d810b95dfe7a163cfa782?pvs=204) · última edición: 2026-09-19T05:08:19.558Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Referencia de decisión; no incluir secretos ni activar la integración por la sola existencia del ADR.

---

**Decisión:** fotos/video360/documentos no atraviesan el backend como stream normal. El cliente carga directamente a R2 mediante una sesión y URL firmada emitida por ILVOX.

**Estado:** Aceptada  
**Fecha:** 2026-09-19
# Contexto
Video360 aumenta ancho de banda, memoria y costo si API actúa como proxy de binarios.
# Decisión
1. API crea `media_asset/upload_session` tenant-scoped.
2. API emite URL firmada temporal con límites esperados.
3. PWA carga directo a R2.
4. PWA confirma completion.
5. API valida metadata/objeto y activa asset.
6. Descargas usan acceso privado + URLs firmadas.
PostgreSQL almacena metadata; R2 almacena el binario.
# Seguridad
Object keys internos sin PII necesaria, bucket privado, MIME/tamaño allowlisted, expiración corta, tenant-safe media links y política de retención central.
# Consecuencias
Reduce carga del backend y costo de transferencia interna; exige lifecycle de upload, cleanup y reconciliación de objetos huérfanos.
# Quality Gate
Upload interrumpido/retry, archivo inválido, checksum/tamaño, URL expirada, cross-tenant y R2 outage.
