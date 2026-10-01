# Identidad, taller activo y permisos

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🔐 ADR-006 — Clerk como proveedor de identidad](https://app.notion.com/p/3df6ab0a330d81ed9345c56bb7c97439?pvs=204) · última edición: 2026-09-20T20:28:30.180Z.
- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Falta congelar el contrato exacto de bootstrap/contexto y selector de taller de Track A. No inventar /me, headers de tenant ni shape de permissions. Clerk establece identidad; membership/roles/permisos provienen del backend.

---

# 3. Decisión
**Seleccionar Clerk, pero únicamente como Identity Provider.**
Clerk será responsable de identidad, sign-in/sign-up, recuperación de acceso, sesiones, emisión/verificación de session JWT, perfil básico de identidad y eventos de usuario por webhook.
PostgreSQL será responsable de workshops, users local, memberships, tenant activo válido, roles, permissions, membership_roles, autorización, ownership, feature access y auditoría de negocio.
**Clerk Organizations, Clerk Roles y Clerk Permissions NO serán la fuente de verdad de autorización del producto.** Ningún rol de Clerk decidirá si un usuario puede leer o modificar una orden, cotización, vehículo o pago.


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

# 10. TenantContext
Flujo: identidad Clerk → users local → memberships → workshop seleccionado → roles/permisos → TenantContext.
TenantContext mínimo: userId, membershipId, tenantId, roles, permissions y requestId.
Reglas: se construye server-side; tenantId solo es válido con membership activa; membership suspendida/revocada bloquea acceso; un usuario solo puede cambiar a talleres donde tenga membership; ninguna operación de negocio se ejecuta sin TenantContext.

# 11. Clerk Organizations
**No son requeridas para el MVP.**
Razones: ya tenemos workshops + memberships; necesitamos integridad multitenant propia; nuestros roles son parte del dominio; evitamos doble fuente de verdad; evitamos sincronización Organization ↔ Workshop; y evitamos depender del pricing B2B para custom roles.
Podrán evaluarse en otro ADR únicamente si aparece una necesidad enterprise concreta como SSO corporativo o provisioning.

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


# 5. Multitenancy
## Modelo recomendado: base compartida + esquema compartido
Cada taller es un `tenant`. Las tablas de negocio incluyen `tenant_id` y las operaciones se ejecutan dentro de un `TenantContext` obligatorio.
**Verificación S1-08:** request con JWT de Clerk verificado → membership activa seleccionada en PostgreSQL → `TenantContext` → GUC `app.*` fijados con `SET LOCAL` dentro de la transacción → RLS `ENABLE + FORCE` bajo API/worker `NOBYPASSRLS`. Los claims `org_role`, `org_permissions` y metadata de Clerk no conceden tenant ni permisos. La conexión reutilizada no conserva GUC tras COMMIT/ROLLBACK, incluido error, retorno temprano o denegación.
```text
Tenant / Workshop
   │
   ├── Memberships ── Users
   ├── Customers
   │      └── Vehicles
   ├── Service Orders
   ├── Quotes
   ├── Media
   ├── Appointments
   ├── Notifications
   └── Subscription
```
### Reglas no negociables
- `tenant_id` tipo UUID en toda tabla perteneciente al taller.
- Las consultas de negocio **nunca** reciben un `tenant_id` arbitrario desde el body; sale del contexto autenticado.
- Índices y `UNIQUE` deben incluir `tenant_id` cuando la unicidad sea local al taller.
- Claves foráneas críticas deben impedir cruzar registros entre tenants.
- Repositorios/servicios reciben `TenantContext` explícitamente.
- Pruebas automáticas de aislamiento entre dos talleres en cada módulo crítico.
- PostgreSQL Row Level Security (RLS) será defensa en profundidad obligatoria desde la migración que introduzca cada tabla tenant-owned; no reemplaza RBAC ni FKs compuestas. API/worker usan roles `NOBYPASSRLS`, no propietarios, y TenantContext transaction-local. Política canónica: [ADR-009 — RLS y privilegios PostgreSQL por TenantContext](https://app.notion.com/p/3e06ab0a330d8162b0cfff78ad1cb9b1).
## Entidades base de tenancy
```text
workshops
workshop_locations  # exactamente una is_primary por workshop; onboarding la crea en la misma transacción
users
memberships
membership_invitations
roles
permissions
membership_roles
```
Roles baseline:
- `owner`
- `admin`
- `service_advisor`
- `technician`
**Matriz canónica de autorización:** [RBAC — Matriz completa de roles y permisos v1](https://app.notion.com/p/3e06ab0a330d81d398ffe925a65506c8)
La autorización es deny-by-default y se evalúa por permission codes server-side; los roles no se usan como atajos dispersos dentro del dominio.

