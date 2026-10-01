# Stack y responsabilidades del frontend

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

El usuario ha fijado repositorios separados: TallerMecario (frontend) y TallerMecarioB (backend). Las antiguas sugerencias monorepo de la fuente no gobiernan esta organización. No se crea src/ ni se seleccionan librerías UI en esta exportación.

---

# 1. Principios arquitectónicos
1. **Modular Monolith primero:** un backend desplegable, dividido por dominios internos claros. Evita microservicios prematuros, reduce costo y simplifica operación.
2. **Multitenancy desde la primera migración:** ninguna entidad de negocio existe sin contexto de taller.
3. **PostgreSQL es la fuente de verdad:** estados, autorizaciones, pagos, historial y auditoría viven en base de datos.
4. **Archivos fuera de PostgreSQL:** fotos, videos y PDF se almacenan en Cloudflare R2; la base solo guarda metadata y referencias.
5. **Videos nunca atraviesan el backend:** el navegador/app solicita una URL firmada y carga directamente a R2.
6. **Integraciones asíncronas:** WhatsApp, Wompi y correo no deben bloquear una operación crítica del taller.
7. **Idempotencia obligatoria:** webhooks, pagos, sincronización offline y reintentos deben poder ejecutarse más de una vez sin duplicar efectos.
8. **Offline tolerante:** la recepción debe poder continuar ante Internet inestable y sincronizar después.
9. **Auditoría por defecto:** cambios sensibles deben registrar quién, cuándo, qué cambió y desde qué taller.
10. **Infraestructura portable:** frontend estático + contenedores Docker + PostgreSQL + almacenamiento S3-compatible para poder cambiar proveedor sin reescribir el producto.

# 4. Stack base propuesto

| Capa | Tecnología | Responsabilidad |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite + PWA | Operación móvil/desktop y experiencia offline |
| API | Node.js + Fastify + TypeScript | Reglas de negocio y API REST |
| Validación | Zod | Contratos de entrada/salida y validación |
| Persistencia | PostgreSQL + Drizzle ORM/SQL | Datos transaccionales y migraciones |
| Archivos | Cloudflare R2 | Videos, fotos, firmas exportadas y PDF |
| Frontend hosting | Cloudflare Pages | CDN global y despliegue estático |
| Backend compute | Contenedor Docker en VPS o Azure Container Apps | API stateless y worker |
| Mensajería | Meta WhatsApp Cloud API | Cotizaciones, estados y recordatorios |
| Pagos | Wompi mediante adaptador interno | Suscripción del taller y eventos de pago |

**Autenticación:** Clerk es el Identity Provider seleccionado en ADR-006 y se mantiene detrás de una interfaz `IdentityProvider` desacoplada del negocio. Memberships, roles y tenant activo siempre pertenecen a PostgreSQL.


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

# 14. Seguridad
El riesgo arquitectónico más grave es una fuga entre talleres. La seguridad multitenant forma parte de cada historia, prueba y Quality Gate.

**Baseline detallado:** [Security Baseline — Aplicación y Plataforma](https://app.notion.com/p/3e06ab0a330d81cc932dc2c9725121e7)
Controles mínimos:
- TLS/HTTPS en todo tránsito.
- Secretos y API keys fuera del frontend, repositorio y logs.
- PostgreSQL accesible solo desde backend/worker; ninguna credencial DB pública.
- Password/identidad gestionada por proveedor especializado o implementación auditada.
- Autenticación y autorización del lado servidor.
- RBAC por membership y tenant.
- FKs multitenant + RLS en tablas sensibles + validación tenant-resource.
- DTOs/allowlists para impedir mass assignment y manipulación de campos protegidos.
- Rate limiting y protección anti-bot en superficies públicas/de autenticación.
- Consultas parametrizadas.
- Validación estricta de toda entrada.
- Escape/sanitización de contenido cuando aplique.
- Cargas de archivos restringidas y privadas.
- Respuestas API minimizadas.
- Cookies/sesiones seguras según mecanismo de autenticación.
- URLs R2 firmadas y temporales.
- Verificación de firmas Wompi/WhatsApp.
- Auditoría de acciones críticas.
- Security headers + CSP/CORS estrictos.
- Dependencias e imágenes con análisis de vulnerabilidades en CI.
- Backups cifrados según capacidad del proveedor.

# 20. Feature flags
Tabla/servicio interno para habilitar funciones por tenant. El lifecycle efectivo (`disabled | scheduled | active | expired`) se deriva de `enabled/enabled_from/enabled_until`; no se persiste un `status` redundante. La precedencia baseline es `tenant > plan > global > default de código`: un `enabled=false` específico bloquea scopes inferiores; una configuración `scheduled` o `expired` aún/no ya aplica y permite continuar al siguiente scope. Ver [Estados y Transiciones por Dominio v1](https://app.notion.com/p/3e06ab0a330d819080edfe450a75a7f5).
Configuración:
```text
feature_key
scope: global | plan | tenant
value
enabled_from
enabled_until
```
Ejemplos:
```text
video360 = ON
whatsapp_automation = OFF
billing_wompi = ON
offline_sync = PILOT_ONLY
```

