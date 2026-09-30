# Contratos pendientes y observaciones para Track B

Registro de exportación — 2026-09-30. Estas observaciones no cambian Notion ni bloquean trabajo independiente de arquitectura/base. Bloquean únicamente las decisiones que dependen de un contrato inexistente o contradictorio.

| ID | Evidencia | Decisión / acción necesaria |
| --- | --- | --- |
| FE-DOC-01 | Arquitectura §§22/25 propone monorepo; el usuario fijó TallerMecario y TallerMecarioB independientes. | Aplicar la instrucción actual de repositorios separados. Actualización compartida de Notion se deja para después; no copiar el layout backend. |
| FE-DOC-02 | ADR-005 declara Estado Aceptada; Arquitectura §9 lo enlaza como aceptado. | Usar el estado actual. La memoria histórica “propuesta” está superada. |
| FE-DOC-03 | RBAC v1 completo y Estados v1 contienen matrices/lifecycles. | No presentarlos como inexistentes ni pendientes de redacción. Su implementación y gates requieren evidencia aparte. |
| FE-DOC-04 | Arquitectura §13.4 documenta CRM online sin Idempotency-Key ni IDs cliente. ADR-005 contempla IDs/operation_id donde el modelo lo permita. | No reintentar POST customer automáticamente ni simular sync CRM. Acordar contrato posterior si Track B necesita creación idempotente. |
| FE-DOC-05 | Gates S3 incluyen evidencia/bundle offline; roadmap sitúa sync completo y expiración/grace en S13; el plan Track B propone solo foundation. | Fijar gate propio del track: drafts foundation y qué requiere integración real. No prometer recepción offline final sin bundle vigente, dedupe y revalidación server. |
| FE-DOC-06 | Diccionario 04 sync_operations.base_version es integer; CRM usa expectedUpdatedAt exacto, sin columna version. | No convertir timestamp a integer ni Date. Acordar versión del protocolo sync antes de integrarlo. |
| FE-DOC-07 | Arquitectura §13 da POST /api/v1/receptions, pero no define su contrato HTTP detallado. Diccionario 04 registra S3-03→S3-04.5. | Obtener de Track A requests, DTOs, paths definitivos, errores y estado aprobado de create/update/close/cancel, checklist, daños, firma y consentimiento. No derivarlos del SQL. |
| FE-DOC-08 | Diagramas de media usan paths ilustrativos /media/upload-sessions y /media/{id}/complete; §13 enumera /api/v1/media/upload-sessions. | Congelar contrato real: método/path, headers PUT, uploadSessionId/mediaAssetId, TTL, allowlist, tamaños, complete, asociaciones, download y errores. |
| FE-DOC-09 | ADR-006 define flujo de identidad/contexto pero no un endpoint de bootstrap frontend, selector de taller ni su DTO exacto. | Leer contrato/backend Track A. No inventar /me, /session, X-Tenant-Id ni un formato de permisos. |
| FE-DOC-10 | Arquitectura §13.3 remite a Estados “Memberships”, pero la página de Estados recibida no tiene una sección de memberships. | Usar el contrato explícito §13.3 (active→suspended/revoked; suspended→revoked). Reportar enlace documental incompleto; no habilitar reactivación. |
| FE-DOC-11 | RBAC siembra customers.archive y audit.read sin endpoints; otros módulos son baseline futura. | Una permission code no crea una feature disponible. Verificar catálogo de endpoints antes de diseñar acciones activas. |
| FE-DOC-12 | Estados §9 presenta errores 409/403/422 como sugeridos; CRM §13.4 usa validación 400 y tiene códigos concretos. | Usar contrato específico por feature. No mapear toda validación a 422 ni todo conflicto a error genérico. |
| FE-DOC-13 | Protección/Diccionario 04 y Gates S3 fijan D-PRIV-01…05. | Secuencia UI: aviso + declaración adulta + finalidades explícitas → autorización service_provision → captura de fotos/video/firma. Propietario principal vigente como titular; terceros/representación fuera MVP. |
| FE-DOC-14 | Snapshot/hash son server-owned; bundle HMAC se valida por el servidor; expiración/grace está pendiente S13. | UI conserva y reenvía envelope original; nunca calcula un hash como autoridad ni guarda la clave HMAC. Obtener endpoint real de textos/bundle y errores. |
| FE-DOC-15 | Arquitectura aún contiene checklist inicial “Sprint 0 pendiente”, mientras otras secciones describen S1/S2/S3. | No inferir estado global del proyecto desde ese encabezado. Pedir evidencia por feature/revisión de Track A. |
| FE-DOC-16 | El plan refiere identidad visual trabajada en conversación, pero páginas leídas no contienen tokens UI finales ni mockup definitivo. | Posterior tarea de diseño: definir tokens y mocks aprobados. No inventar paleta o dependencias como parte de esta exportación. |

## Riesgos concretos para componentes

- Cambios de propietario y de consentimiento pueden invalidar una recepción nueva; conservar formulario y mostrar el error, sin overwrite silencioso.
- updatedAt es token opaco exacto para PATCH; formatear una copia solo para presentación.
- Técnico no accede a búsqueda CRM/listados generales; VehicleTechDto es deliberadamente reducido y A/Q se decide por recurso.
- Cambio de taller/sesión exige separar datos locales por identidad y tenant. La cola pendiente no debe pasar a otra cuenta ni borrarse silenciosamente.
- Firmas de recepción y entrega son actos separados: media distinta para cada captura. Cuarentena conserva historia pero bloquea acceso normal.
- No habilitar botones de pagos, roles, autorización pública ni privacidad de alto impacto como operaciones offline completadas.

## Evidencia requerida antes del vertical slice

Contrato de Track A con revisión/commit de referencia; enums/DTOs/headers/errores; fixtures de éxito y rechazo; permisos y scopes; política de retry/idempotencia; CORS y subida directa R2; prueba de integración. Los documentos de Notion por sí solos no certifican estos endpoints.
