# S3-UI-03 — verificación local

2026-10-02 · rama `task/s3-crm-ui` · Node 22.22.2.

- Implementadas las ocho rutas de listado, creación, detalle y edición de Clientes y Vehículos.
- Contrato: `docs/api/crm.md` §13.4 y especificación S3-UI-03 suministrada por el usuario.
- Clientes: GET/POST/PATCH; filtros name, phone, documentNumber; cursor opaco, limit 20.
- Vehículos: GET/POST/PATCH; filtro plate; GET owners condicionado a customers.read + vehicles.read tenant.
- Listas, formularios y navegación requieren scopes tenant. Detalle de vehículo admite tenant o assigned; quality_control no concede assigned.
- Crear vehículo exige vehicles.create + vehicle_owners.manage + customers.read tenant y acceso al detalle resultante.
- OCC: PATCH solo campos modificados y expectedUpdatedAt exacto. Conserva campos editados, actualiza los demás, recupera y exige revisión explícita.
- GET: un retry de 401 con token fresco. POST/PATCH: sin retry automático ni Idempotency-Key.
- AbortSignal y remontaje por identidad, tenant y grants invalidan resultados y formularios, incluidas respuestas tardías.
- 57 pruebas nuevas; 419 tests totales en 24 archivos. Incluye regresiones existentes de Auth G1–G5, selección de taller, Landing, Login, Dashboard y Recepciones.
- Gates PASS: npm run typecheck; npm run lint -- --max-warnings 0; npm run test; npm run build; git diff --check.
- Build emite advertencia informativa: chunk principal 521.10 kB minificado; no se cambiaron límites para ocultarla.
- Revisión real en Edge headless: 40 vistas, ocho rutas × 1440/1024/768/390/320. Sin overflow horizontal ni errores JS; un h1 por pantalla.
- Revisados listas, búsqueda, formularios, detalle, contenido largo, menú y acciones. Teclado cambia de campo y enfoca el primer error. Targets de controles ≥44 px.
- Corregido encabezado del App Shell a 320 px; acciones de sesión pasan a segunda fila. Revisado el menú tras finalizar la animación.
- Evidencia sintética local: %TEMP%/tm-s3-crm-responsive (PNG y report.json); sin PII real.
- No se añadió enlace Nueva recepción desde vehículo: la ruta actual no recibe selección de vehículo.
- No se ejecutó E2E contra backend desplegado ni CI remoto. Se verificaron HTTP, headers, DTOs y errores con transporte inyectado en el cliente real.
- Fuera de alcance: DELETE/archive, cambio de propietario, join cliente→vehículos, media y offline. Sin dependencias nuevas, cambios de contratos ni push.
