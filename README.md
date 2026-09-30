# TallerMecario — documentación frontend

Exportación seleccionada de Notion realizada el **30 de septiembre de 2026**. Destino: repositorio **TallerMecario**. Backend: **TallerMecarioB**.

Esta carpeta reúne referencias de producto/dominio, contratos documentados y decisiones que afectan la PWA. No contiene AGENTS.md, arquitectura src/, código React ni una propuesta nueva de contratos.

## Cómo incorporarla

Extraer el ZIP y revisar README.md, OPEN-QUESTIONS.md y SOURCE-MANIFEST.json antes de copiar **docs/** a la raíz del repositorio frontend. El ZIP ya contiene la carpeta docs/; no crear docs/docs/.

Conservar los enlaces, fechas y estado de las fuentes. No sustituir documentación existente sin revisar diferencias.

## Lectura inicial de agentes

1. [Producto](product/product-overview.md) y [alcance/roadmap](product/mvp-and-sprint-scope.md).
2. [Límite frontend/backend](architecture/frontend-boundary.md).
3. [Identidad y taller](architecture/authentication-and-workshop.md).
4. [RBAC](domain/roles-and-permissions.md).
5. [Convenciones HTTP](api/conventions-and-errors.md) y [CRM](api/crm.md).
6. [Privacidad](privacy/privacy-product-requirements.md) y [evidencia de recepción](domain/data-dictionary/05-privacy-and-offline.md).
7. [Recepción: contrato pendiente](api/reception-and-media-contract-status.md).
8. [Media](architecture/media.md) y [PWA/offline](architecture/pwa-offline.md).
9. [Estados](domain/states-and-transitions.md), diccionarios por feature y [gates](quality/frontend-relevant-gates.md).

Consultar inventario, billing, autorización pública y WhatsApp cuando se planifique la feature correspondiente. No implementar todo el roadmap en este sprint.

## Autoridad de la documentación

- Instrucciones explícitas del usuario gobiernan el alcance y la organización de repositorios.
- Notion conserva las decisiones compartidas de producto/dominio; esta carpeta es una captura de referencia.
- Los contratos específicos HTTP S1/S2 documentados en Arquitectura §13 prevalecen sobre ejemplos narrativos y nombres SQL.
- El contrato aprobado de Track A y su evidencia de implementación deben congelarse antes de integrar recepción/media.
- El backend aplica autorización, tenant, integridad, pagos y transiciones; los guards frontend mejoran UX.
- Una fuente marcada Aceptada no significa que su implementación esté desplegada o su gate haya pasado.

Si las fuentes se contradicen, registrar **DOC_CONFLICT** con documento/sección, contrato actual, propuesta e impacto frontend/backend. No inventar el contrato para continuar.

## Método de exportación

24 páginas de Notion leídas: página del proyecto, arquitectura, ERD, diccionario padre y cinco páginas hijas, RBAC, estados, privacidad, seguridad, operación, roadmap, gates, inventario, contratos externos y seis ADR relevantes.

Los documentos son extractos de contenido, salvo secciones identificadas como síntesis editorial. Se normalizaron tablas Notion a Markdown, callouts y enlaces. Se conservan enums, códigos, nombres técnicos y decisiones pendientes. Se omitieron dumps/restores, roles DB, workers/outbox/webhooks, índices/DDL y runbooks como contexto operativo principal. Algunas notas internas de integridad se conservan en campos de dominio y ADRs para explicar el comportamiento.

No se exportaron adjuntos binarios, comentarios ni bases de datos de tareas. No se modificaron las páginas canónicas. Esta captura se leyó página a página; no es una exportación atómica de todo el workspace.

## Límites de fidelidad

Notion no devolvió campos explícitos truncated/unknown_block_count para estas páginas; el manifiesto registra “no reportado”, en vez de atribuirles un cero. No aparecieron bloques <unknown> en el texto recibido. La verificación nativa de las fuentes figura unverified; eso no invalida su designación de canónicas, pero no se transforma en una verificación de implementación.

## Qué sigue

Revisar las preguntas abiertas con Track A y el AGENTS.md del backend. Después construir AGENTS.md frontend adaptado a este repositorio. Ese archivo deliberadamente no forma parte de esta entrega.
