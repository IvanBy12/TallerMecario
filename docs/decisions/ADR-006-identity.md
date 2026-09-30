# 🔐 ADR-006 — Clerk como proveedor de identidad

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🔐 ADR-006 — Clerk como proveedor de identidad](https://app.notion.com/p/3df6ab0a330d81ed9345c56bb7c97439?pvs=204) · última edición: 2026-09-20T20:28:30.180Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Referencia de decisión; no incluir secretos ni activar la integración por la sola existencia del ADR.

---

**Decisión:** utilizar **Clerk como proveedor de identidad y autenticación**, mientras TallerMecario mantiene en PostgreSQL la autoridad sobre talleres, memberships, roles, permisos y TenantContext.

**ADR:** ADR-006  
**Estado:** Aceptada  
**Fecha:** 2026-09-18  
**Ámbito:** Sprint 0 / desbloquea Sprint 1  
**Arquitectura relacionada:** [Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a)  
**ERD relacionado:** [Fuente Notion](https://app.notion.com/p/3df6ab0a330d81fda465f8944c3291e6)  
**Quality Gates:** [Fuente Notion](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573)

# 1. Contexto
Sprint 1 requiere login seguro, usuarios, memberships, selección de taller y RBAC. El proveedor de identidad no debe convertirse en la fuente de verdad del negocio ni del aislamiento multitenant.
El sistema necesita: registro/login y recuperación de cuenta; sesiones seguras; integración React + Fastify; identificación estable del usuario; webhooks de lifecycle; bajo costo; baja carga operativa; posibilidad de cambiar de proveedor; y RBAC/tenant isolation controlados por nuestra propia base.
# 2. Alternativas evaluadas

| Opción | Ventajas | Desventajas para TallerMecario |
| --- | --- | --- |
| **Clerk — auth only** | Fastify SDK, JWT verificable, UI/login gestionado, webhooks, baja operación | Proveedor externo; evitar dependencia de Organizations/RBAC propietario |
| Better Auth | Self-hosted, control total, organizations/roles disponibles | Mayor responsabilidad sobre seguridad, sesiones, upgrades y operación |
| Supabase Auth | Buen costo, JWT/RLS, amplio ecosistema | No usamos Supabase como plataforma principal; organizations/RBAC de negocio requieren diseño propio igualmente |
| Auth0 | Muy maduro, B2B/RBAC/enterprise | Mayor complejidad/costo para el MVP y capacidades enterprise innecesarias inicialmente |

# 3. Decisión
**Seleccionar Clerk, pero únicamente como Identity Provider.**
Clerk será responsable de identidad, sign-in/sign-up, recuperación de acceso, sesiones, emisión/verificación de session JWT, perfil básico de identidad y eventos de usuario por webhook.
PostgreSQL será responsable de workshops, users local, memberships, tenant activo válido, roles, permissions, membership_roles, autorización, ownership, feature access y auditoría de negocio.
**Clerk Organizations, Clerk Roles y Clerk Permissions NO serán la fuente de verdad de autorización del producto.** Ningún rol de Clerk decidirá si un usuario puede leer o modificar una orden, cotización, vehículo o pago.

# 4. Motivo principal
Esta separación reduce lock-in y mantiene la seguridad multitenant donde ya se diseñó: PostgreSQL + dominio de aplicación.
También evita que nuestros roles comerciales baseline —owner, admin, service_advisor y technician— dependan de límites o pricing B2B de un tercero.
**El proveedor autentica quién eres. Nuestra plataforma decide a qué taller perteneces y qué puedes hacer.**
# 5. Flujo de autenticación
1. Usuario inicia sesión en la PWA.
2. Clerk completa autenticación y emite sesión/JWT.
3. La PWA llama a Fastify con el token.
4. Fastify verifica firma, expiración y origen autorizado.
5. Se obtiene el external user subject.
6. PostgreSQL resuelve el user interno.
7. PostgreSQL carga memberships activas.
8. Se valida el taller solicitado.
9. Se cargan roles/permisos locales.
10. Se construye TenantContext server-side.
# 6. Mapeo local de usuario
La tabla local users conserva: id interno UUID, identity_provider = clerk, external_subject = Clerk user id, email, full_name, status y timestamps.
Constraint obligatorio: UNIQUE(identity_provider, external_subject).
El ID de Clerk nunca será PK de tablas de negocio. Las entidades de dominio referencian IDs internos de TallerMecario.
# 7. Sincronización de identidad y provisioning JIT
Eventos previstos: user.created, user.updated y user.deleted.
## Política explícita de primer login
1. La API recibe una request autenticada.
2. ClerkIdentityProvider verifica firma, expiración y claims requeridos del JWT.
3. Se extrae el `sub` verificado.
4. PostgreSQL busca `users` por `(identity_provider='clerk', external_subject=sub)`.
5. Si no existe, se crea mediante UPSERT idempotente la representación local mínima del usuario.
6. El UPSERT puede usar únicamente datos de identidad verificados/obtenidos a través del proveedor; nunca roles, tenant o permisos enviados por el frontend.
7. Después se consultan memberships locales.
8. Si no existe membership activa, la respuesta es 403/estado de onboarding; no se crea acceso implícito.
9. Cuando llegue el webhook, reconcilia/actualiza el mismo `users` sin duplicarlo.
Constraint clave: `UNIQUE(identity_provider, external_subject)` hace segura la carrera entre JIT y webhook.
## Webhooks
El webhook debe verificar firma, registrar webhook_events, procesar idempotentemente y crear/actualizar únicamente la representación local mínima del usuario.
**Nunca** debe crear memberships o permisos implícitamente por confiar en metadata externa.
Si una identidad se elimina, el historial del taller no se borra: el usuario local se deshabilita según política, sus memberships se revocan/deshabilitan y la auditoría permanece.
# 8. Verificación en Fastify
El backend verificará cada request protegido usando el SDK backend/Fastify de Clerk detrás de nuestro adapter.
Controles: validación de token, expiración y firma; authorizedParties; preferencia por validación networkless con JWT public key cuando corresponda; extracción de identidad mínima; memberships/RBAC siempre contra PostgreSQL.
No se confiará en tenant_id enviado en body, role enviado por frontend, workshop no validado contra membership ni metadata de Clerk para autorizar dominio.
# 9. IdentityProvider adapter
El dominio no importará Clerk directamente.
Contrato conceptual del adapter: verifyRequest, getExternalUserId, getSessionId y getIdentityProfile.
Implementación inicial: ClerkIdentityProvider.
Una futura migración podría añadir BetterAuthIdentityProvider, Auth0IdentityProvider u otro sin reescribir customers, vehicles, orders, quotes o billing.
# 10. TenantContext
Flujo: identidad Clerk → users local → memberships → workshop seleccionado → roles/permisos → TenantContext.
TenantContext mínimo: userId, membershipId, tenantId, roles, permissions y requestId.
Reglas: se construye server-side; tenantId solo es válido con membership activa; membership suspendida/revocada bloquea acceso; un usuario solo puede cambiar a talleres donde tenga membership; ninguna operación de negocio se ejecuta sin TenantContext.
# 11. Clerk Organizations
**No son requeridas para el MVP.**
Razones: ya tenemos workshops + memberships; necesitamos integridad multitenant propia; nuestros roles son parte del dominio; evitamos doble fuente de verdad; evitamos sincronización Organization ↔ Workshop; y evitamos depender del pricing B2B para custom roles.
Podrán evaluarse en otro ADR únicamente si aparece una necesidad enterprise concreta como SSO corporativo o provisioning.
# 12. Costos y límites
Clerk mantiene actualmente un plan gratuito con volumen suficiente para MVP/piloto, pero el diseño no depende de Clerk B2B.
El pricing se revisará antes de producción comercial. Si deja de ser conveniente, el adapter permitirá migrar identidad sin reescribir RBAC ni multitenancy.
# 13. Protección de datos personales y seguridad
**Referencia:** [Fuente Notion](https://app.notion.com/p/3df6ab0a330d81e2a93cf52f0e6c12d7)
Clerk entra al Data Processing Map como proveedor que trata datos de identidad. Antes de producción se deberán revisar su DPA/términos, subprocesadores, regiones/ubicación aplicable y mecanismo de transmisión/transferencia internacional conforme a la normativa colombiana.
La integración minimizará datos enviados a Clerk: identidad y sesión. No se enviarán órdenes, diagnósticos, cotizaciones, pagos, videos ni demás datos operativos del taller salvo que exista una finalidad y decisión arquitectónica posterior expresamente documentada.
- [ ] Keys/secrets fuera del repositorio.
- [ ] Development, staging y production separados.
- [ ] authorizedParties validado.
- [ ] Token inválido/expirado devuelve 401.
- [ ] Usuario autenticado sin membership devuelve 403.
- [ ] Membership sin permiso devuelve 403.
- [ ] Tenant cruzado devuelve 403 y, donde aplique, falla en DB.
- [ ] Webhooks firmados e idempotentes.
- [ ] Lifecycle auditado.
- [ ] Tokens y secretos nunca aparecen en logs.
- [ ] No duplicar autorización en claims externos.
# 14. Failure modes
**Clerk temporalmente no disponible:** minimizar roundtrips por request usando verificación local del token cuando sea posible. Nuevos logins pueden verse afectados, pero el negocio no debe consultar Clerk remotamente para cada operación.
**Webhook retrasado / primer login:** se adopta **provisioning Just-In-Time (JIT) seguro** para crear únicamente la representación local de `users` cuando la primera request autenticada llega antes que `user.created`. El backend primero verifica criptográficamente el JWT de Clerk; solo después puede hacer un UPSERT idempotente de `users` usando `identity_provider='clerk'` + `external_subject=sub` verificado. El JIT **nunca** crea workshops, memberships, roles ni permisos. Si el usuario local existe pero no tiene membership activa, permanece autenticado pero recibe 403/estado de onboarding sin acceso a datos de negocio. El webhook `user.created`/`user.updated` actúa como reconciliación eventual y debe producir el mismo resultado idempotente.
**Usuario eliminado en Clerk:** se revoca/deshabilita acceso local sin borrar historial operativo.
# 15. Quality Gate ADR-006 / Sprint 0–1
- [ ] Clerk configurado en development/staging.
- [ ] Login válido.
- [ ] Token inválido/expirado rechazado.
- [ ] authorizedParties probado.
- [ ] external_subject sincronizado.
- [ ] Primera request autenticada antes del webhook crea `users` local mediante JIT idempotente.
- [ ] Carrera JIT vs `user.created` no duplica usuarios.
- [ ] JIT sin membership devuelve 403/onboarding y nunca crea permisos.
- [ ] JIT crea evento `identity.user_provisioned_jit` en audit_logs sin registrar JWT ni payload completo de Clerk.
- [ ] user.created idempotente.
- [ ] user.updated idempotente.
- [ ] user.deleted no destruye historial.
- [ ] Usuario sin membership recibe 403.
- [ ] Usuario con membership entra a su taller.
- [ ] Usuario multi-taller cambia solo entre memberships válidas.
- [ ] TenantContext se construye server-side.
- [ ] Tenant A no accede Tenant B aunque manipule request.
- [ ] Roles/permisos se obtienen de PostgreSQL, no de Clerk.
- [ ] Dominio no importa SDK de Clerk.
- [ ] Secretos no aparecen en logs/repositorio.
- [ ] Retraso/falla de webhook no crea privilegios.
- [ ] Regresión de auth pasa en staging.
- [ ] Clerk figura en el inventario de proveedores/subencargados.
- [ ] DPA/términos y tratamiento internacional revisados antes de producción.
- [ ] Datos enviados a Clerk cumplen minimización y finalidad.
**ADR-006 desbloquea el diseño de Sprint 1, pero Sprint 1 solo pasa cuando login, membership, RBAC y aislamiento multitenant tengan evidencia PASS en el Quality Gate.**

# 16. Consecuencias
**Positivas:** velocidad de implementación, menor superficie de seguridad propia en login, integración Fastify, RBAC/multitenancy bajo control del producto, menor lock-in y costos B2B avanzados no requeridos.
**Negativas:** dependencia externa de identidad, sincronización mínima de usuarios, mantenimiento del adapter y afectación de nuevos logins ante outage del proveedor.
# 17. Alternativa de salida
Si Clerk deja de cumplir costo, disponibilidad o requisitos: implementar un segundo IdentityProvider, migrar external subjects, conservar IDs internos ILVOX y mantener memberships/RBAC sin cambios.
# 18. Referencias técnicas
- [Clerk Pricing](https://clerk.com/pricing)
- [Clerk Fastify SDK](https://clerk.com/docs/reference/fastify/overview)
- [Clerk JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Clerk webhooks](https://clerk.com/docs/guides/development/webhooks/syncing)
- [Clerk Organizations](https://clerk.com/docs/guides/organizations/overview)
- [Better Auth Organizations](https://better-auth.com/docs/plugins/organization)
- [Supabase RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)
- [Auth0 Pricing](https://auth0.com/pricing)
**Decisión final:** Clerk queda seleccionado para autenticación/identidad, no para autorización de dominio.
