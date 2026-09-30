# Seguridad aplicable a la PWA

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🛡️ Security Baseline — Aplicación y Plataforma](https://app.notion.com/p/3e06ab0a330d81cc932dc2c9725121e7?pvs=204) · última edición: 2026-09-20T20:25:13.173Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

La PWA consume HTTP. Secretos privados de Clerk, R2, Wompi y WhatsApp nunca llegan al navegador. No copiar SQL ni usar seguridad de UI como autoridad.

---

# 1. Secretos y credenciales
- **Ocultar claves de API:** ninguna secret key puede llegar al bundle frontend, repositorio, logs o respuestas API.
- Secretos de Clerk, PostgreSQL, R2, Wompi, WhatsApp, correo y demás proveedores viven únicamente en variables/secret store del entorno.
- Para WhatsApp multi-tenant, PostgreSQL solo conserva `credential_secret_ref`/metadata no secreta en `tenant_whatsapp_accounts`; tokens/access material reales viven en secret store y se resuelven server-side por tenant.
- Ninguna credencial WhatsApp de Tenant A puede utilizarse para operar la WABA/phone_number_id de Tenant B; el scope y la asociación se validan antes de cada envío.
- Solo se permiten claves explícitamente diseñadas como **publishable/public** en frontend.
- **PostgreSQL no tendrá ninguna clave pública expuesta al navegador.** La PWA nunca se conecta directamente a la base; solo API/worker acceden con credenciales privadas y privilegios mínimos.
- Rotación documentada de secretos.
- Separación de secretos por development/staging/production.

# 2. Purgado y detección de secretos en Git
- Secret scanning obligatorio en CI.
- `.env`, certificados y archivos de credenciales fuera de Git.
- Si un secreto entra al historial: **rotar primero**, luego purgar historial con herramienta apropiada y volver a escanear.
- Nunca asumir que borrar el archivo en un commit elimina el secreto del historial.
- PR bloqueado si el escáner detecta credenciales de alta confianza.

# 4. Encriptación de datos sensibles
- TLS obligatorio en tránsito.
- Cifrado at-rest provisto por infraestructura para DB, backups y storage.
- Evaluar cifrado a nivel aplicación/campo para PII de mayor riesgo que no necesite búsquedas directas.
- Claves de cifrado separadas de los datos y fuera de la base.
- No cifrar “por cumplir” campos que requieran búsqueda sin diseñar previamente indexación/tokenización.
- Tokens públicos de aprobación/recuperación se almacenan como **hash**, no en texto plano.
- OTP de autorización de cotización también se almacena exclusivamente como `code_hash`; el código crudo no se persiste en PostgreSQL, outbox ni logs.

# 5. Autenticación server-side
- Toda ruta protegida verifica autenticación en Fastify.
- El frontend nunca decide si una sesión es válida.
- Clerk JWT se valida antes de provisioning JIT o construcción de TenantContext.
- Sesión inválida/expirada → 401.
- Usuario sin membership → 403/onboarding.
- Membership sin permiso → 403.
- Toda autorización de negocio se resuelve server-side.

# 6. Acceso a registros
- Toda lectura/escritura tenant-owned exige TenantContext.
- Repositorios reciben tenant explícito desde contexto verificado, nunca desde payload arbitrario.
- RLS + FKs compuestas + autorización de aplicación forman capas independientes.
- Endpoints públicos usan tokens de un solo propósito, alta entropía, expiración, revocación y alcance mínimo.
- Los tokens públicos se almacenan únicamente como hash y nunca se reutilizan entre propósitos (p. ej. seguimiento de orden vs autorización de cotización).
- Para decisiones de cotización, conocer el link no basta: se exige `quote_authorization_challenge` OTP verificado y vigente antes del commit de aprobar/rechazar/parcial.
- El OTP enviado al mismo WhatsApp protege contra fuga aislada del URL, pero no contra compromiso total de la cuenta del cliente; esta limitación forma parte del threat model.
- Acceso público nunca se autoriza por IDs/tickets enumerables, placa, teléfono o documento.
- Acceso a media únicamente con autorización previa y URL firmada temporal.

# 7. Protección contra manipulación de campos
- DTOs de entrada con **allowlist explícita**.
- Zod rechaza campos inesperados cuando el contrato lo requiera.
- No hacer spread directo de `request.body` hacia INSERT/UPDATE.
- Campos como `tenant_id`, `created_by`, roles, permissions, status protegidos y derivados server-side.
- Transiciones de estado por comandos de dominio, no por PATCH genérico.

# 8. Cookies y sesión
- Cookies de sesión con `Secure` y `HttpOnly` cuando aplique.
- Política `SameSite` definida según flujo real.
- No persistir tokens sensibles en storage inseguro si puede evitarse.
- CSRF se evalúa según el mecanismo real de autenticación/cookie utilizado.
- Logout/revocación debe invalidar acceso conforme al proveedor y backend.

# 9. Contraseñas
- **ILVOX no almacenará contraseñas de usuarios mientras Clerk sea el IdP.**
- El hashing de contraseñas corresponde al proveedor de identidad.
- Si algún módulo futuro almacena credenciales propias, requerirá un ADR de seguridad y algoritmo de password hashing moderno con salt y parámetros revisados.
- API keys propias, magic tokens y approval tokens nunca se guardan como “contraseña reversible”; usar hash cuando solo se necesite comparación.

# 10. Rate limiting y protección contra bots
- Rate limiting por IP/identidad/ruta según riesgo.
- Límites especialmente estrictos en login, invitaciones, aceptación de invitaciones, enlaces públicos, OTP/challenges, uploads y webhooks.
- OTP baseline: TTL 5 minutos, máximo 5 intentos por challenge y cooldown de reenvío de 60 segundos; además debe existir rate limit configurable por token/IP/destino.
- Protección anti-bot/WAF/CAPTCHA o desafío administrado en superficies públicas de riesgo.
- Bloqueos no deben impedir operación legítima del taller; thresholds y excepciones deben medirse.
- Alertar sobre patrones de credential stuffing, scraping o abuso.

# 12. Validación de entrada
- Toda entrada externa se valida: body, params, query, headers relevantes, webhooks, CSV/importaciones y metadata de archivos.
- Límites de longitud, tipos, formatos y rangos.
- Rechazar propiedades inesperadas en operaciones sensibles.
- No confiar en datos recibidos desde frontend aunque la UI ya los valide.

# 13. Escape y sanitización de contenido
- React mantiene escape por defecto; evitar `dangerouslySetInnerHTML` salvo caso documentado.
- Si se admite HTML/rich text, sanitizar con allowlist.
- Escapar contexto correcto en HTML, atributos, URLs y plantillas.
- Mensajes, notas y nombres de archivos no se interpolan sin tratamiento en HTML/SQL/shell.

# 14. Cargas de archivos
- Allowlist de MIME/extensiones por caso de uso.
- Validar tipo real/metadata y no solo extensión.
- Límite de tamaño y duración.
- Nombres/object keys generados internamente, sin PII necesaria.
- Upload mediante URL firmada de corta duración.
- Bucket privado.
- Estado pending/uploaded/active/quarantined.
- Posibilidad de cuarentena/escaneo según tipo de archivo y riesgo.
- Nunca ejecutar archivos cargados por usuarios.

# 15. Respuestas API mínimas
- **Data minimization por respuesta:** devolver solo campos necesarios.
- DTOs de salida, no serializar entidades completas automáticamente.
- Nunca devolver hashes, secrets, provider payloads internos o metadata operativa innecesaria.
- PII solo para roles y casos de uso autorizados.
- Errores de producción no exponen stack traces, SQL ni infraestructura.

# 16. Encabezados de seguridad
- CSP restrictiva.
- HSTS en producción.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy` definida.
- `Permissions-Policy` restrictiva.
- Protección clickjacking mediante CSP `frame-ancestors` y/o header compatible.
- CORS con orígenes explícitos; nunca `*` con credenciales.

# 17. HTTPS
- HTTPS obligatorio en producción y staging expuesto.
- Redirección HTTP → HTTPS cuando exista endpoint HTTP.
- Cookies Secure.
- Webhooks únicamente HTTPS.
- URLs firmadas y callbacks no usan HTTP.

# 18. Dependencias y supply chain
- Dependency scanning en CI.
- Lockfile versionado.
- Actualizaciones de seguridad priorizadas.
- Vulnerabilidades críticas bloquean release.
- Revisar paquetes nuevos antes de incorporarlos.
- Imágenes Docker con base mínima y scanning.
- SBOM/reporte de componentes antes de release comercial si la herramienta lo permite.

