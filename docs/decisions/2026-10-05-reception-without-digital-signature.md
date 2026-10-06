# Recepción sin firma digital — decisión del usuario, 2026-10-05

El usuario solicitó retirar la firma digital para evitar la espera de captura y subida y autorizó el cambio en TallerMecario y TallerMecarioB.

El flujo estándar es: consentimiento de servicio y declaración adulta → recepción → inspección → confirmar cierre → orden. La decisión retira sólo la firma digital de recepción. No sustituye ni elimina el consentimiento de privacidad.

DOC_CONFLICT resuelto explícitamente: Track A `docs/api/reception-contract.md` §5.8 exigía firma para cerrar; la decisión actual elimina ese requisito. El backend cambia `close.ts`, la coherencia del detalle en `queries.ts` y el trigger de ciclo de vida mediante la migración nueva 0024. El contrato local de Track A registra la revisión; los snapshots exportados de Notion y las migraciones anteriores no se reescriben.

El frontend elimina captura, documento de aceptación y subida R2 del flujo. Las firmas históricas permanecen visibles y no se borran ni reescriben. Los endpoints antiguos de firma se conservan por compatibilidad, con sus permisos y guardas existentes.

Se mantienen autorización server-side, aislamiento de tenant, consentimiento para crear, edición sólo abierta, recuperación de conflictos, kilometraje y cierre atómico/idempotente con una orden, un historial inicial y auditoría.

E2E-01 cubre el nuevo flujo y verifica ausencia de firma y requests de media; E2E-02 comprueba replay de cierre; E2E-03 observa el estado inicial. E2E-06 de firma/R2 se retira por alcance, sin marcarlo PASS. Los gates externos/documentales de Sprint 3 siguen independientes.

La migración 0024 se aplicó correctamente en el ambiente local de prueba el 2026-10-05. El backend actualizado se reinició con autorización explícita del usuario y el E2E móvil real pasó E2E-01/02/03 (3/3), sin captura de firma ni solicitudes de media/R2, reutilizando las sesiones existentes. No se hacen commits ni se publican secretos, estados de sesión o reportes autenticados.
