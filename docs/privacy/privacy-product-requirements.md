# Privacidad que afecta a formularios y capturas

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🛡️ Protección de Datos Personales — Colombia v1](https://app.notion.com/p/3df6ab0a330d81e2a93cf52f0e6c12d7?pvs=204) · última edición: 2026-09-29T04:57:14.752Z.
- Fuente: [4️⃣ Diccionario 04 — Privacidad y Plataforma](https://app.notion.com/p/3e06ab0a330d815d8559cd85974347bc?pvs=204) · última edición: 2026-09-29T05:16:14.516Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Reproducción de requisitos internos documentados, no una revisión jurídica nueva. Quien entrega debe ser el propietario principal vigente y declarar mayoría de edad. Finalidades opcionales nunca premarcadas ni bloqueantes.

---

# 1. Modelo de responsabilidades
## Taller como Responsable
Cuando un taller decide para qué recolecta y usa datos de sus clientes, vehículos, contactos, firmas, fotos, videos, autorizaciones y pagos, el taller actúa como **Responsable del Tratamiento**.
## ILVOX como Encargado
Cuando ILVOX almacena/procesa esos datos únicamente para prestar el SaaS siguiendo instrucciones del taller, ILVOX actúa como **Encargado del Tratamiento**.
## ILVOX como Responsable propio
ILVOX puede actuar como Responsable respecto de datos que recoge para sus propias finalidades: cuentas de administradores, facturación SaaS, soporte, seguridad, comunicaciones contractuales y eventualmente marketing propio.
**Nota de nomenclatura:** el renombrado del producto de ILVOX Taller a **TallerMecario** no cambia el literal técnico `controller_scope='ilvox'` en `data_subject_requests` ni `privacy_security_incidents`. En esos campos `ilvox` identifica a la organización que actúa como Responsable propio, no al nombre comercial del producto.

El contrato comercial con cada taller deberá incluir cláusulas/Anexo de Tratamiento de Datos que definan finalidad, alcance, instrucciones, confidencialidad, medidas de seguridad, subencargados, incidentes, devolución/supresión y derechos de titulares.


# 2. Datos personales que tratará la plataforma

| Categoría | Ejemplos | Tratamiento |
| --- | --- | --- |
| Identificación/contacto | nombre, documento, teléfono, email | Personal |
| Vehículo asociado | placa, VIN, historial, propietario | Puede constituir dato personal cuando se asocia a una persona |
| Operación | órdenes, diagnósticos, cotizaciones, historial | Personal cuando se vincula al cliente |
| Multimedia | fotos, video 360°, documentos | Personal si permite identificar a una persona o contiene identificadores |
| Imagen/biometría | rostros capturados, firma manuscrita digitalizada | Mayor cautela; datos biométricos pueden ser sensibles |
| Comunicaciones | WhatsApp, email, estados de mensajes | Personal |
| Pagos operativos | monto, método, referencia/comprobante | Personal/financiero según contexto |
| Seguridad | IP, user-agent, logs de acceso | Personal cuando permite asociación con individuo |


# 3. Principios que deben reflejarse en producto
- **Finalidad:** recolectar solo para finalidades informadas y legítimas.
- **Libertad/autorización:** conservar prueba de autorización cuando sea exigible.
- **Necesidad/minimización:** no pedir datos que el taller no necesita para prestar el servicio.
- **Veracidad/calidad:** permitir actualización y corrección.
- **Acceso restringido:** RBAC + tenant isolation + URLs firmadas.
- **Seguridad:** controles técnicos, humanos y administrativos.
- **Confidencialidad:** acceso solo a personal autorizado y proveedores necesarios.
- **Temporalidad/retención:** conservar datos solo durante el tiempo necesario o exigido legal/contractualmente.
- **Responsabilidad demostrada:** poder probar qué controles existen y que realmente funcionan.

# 4. Autorizaciones y evidencia
La autorización debe ser previa, expresa e informada cuando aplique y debe poder consultarse posteriormente.
La plataforma debe registrar evidencia versionada, no solamente un booleano.
## Entidad propuesta: privacy_consents
- id
- tenant_id
- customer_id / subject reference
- purpose_code
- privacy_notice_version
- authorization_text_version
- authorization_text_hash (sha256 canónico calculado por el servidor)
- controller_notice_snapshot (identidad del Responsable mostrada, inmutable)
- channel
- status: granted \| revoked
- captured_at
- revoked_at nullable
- evidence_hash / evidence_media_id nullable
- ip_address nullable
- user_agent nullable
- created_by nullable
Finalidades deben ser separables, por ejemplo:
- prestación del servicio del taller;
- contacto operativo;
- envío de cotización/estado por WhatsApp;
- recordatorios;
- marketing/promociones;
- uso de imagen cuando corresponda.
No asumir que autorizar teléfono o email autoriza automáticamente WhatsApp/marketing. Los canales y finalidades deben quedar informados y trazables.

## Regla de recepción de vehículos
**No se acepta un vehículo (no se crea la ****`reception`**** ni se captura foto, video 360° o firma) sin aviso de privacidad mostrado y una autorización ****`granted`**** para ****`service_provision`****.** Es la única finalidad obligatoria; `marketing`, `image_use`, recordatorios y WhatsApp son opcionales y nunca condicionan el servicio (Ley 2300 de 2023).

El taller es el Responsable, por lo que el aviso debe identificar al taller y su canal para derechos (Ley 1581, art. 12). La recepción enlaza el consentimiento que la cubrió (`receptions.privacy_consent_id`). Catálogo de finalidades, flujo, reglas de revocación y decisiones canónicas D-PRIV-01, D-PRIV-02 y D-PRIV-03: [Fuente Notion](https://app.notion.com/p/3e06ab0a330d815d8559cd85974347bc) §1.1.

# 5. Fotos, video 360° y firma
Reglas de diseño:
- evitar capturar rostros/personas si no son necesarios;
- advertir al usuario antes de iniciar video/fotos;
- no usar reconocimiento facial ni biometría para el MVP;
- si accidentalmente aparece una persona, el acceso sigue restringido como dato personal;
- la firma se usa únicamente como evidencia de recepción/entrega/autorización según finalidad definida;
- media se almacena con object keys internos sin nombres, cédulas, placas visibles en ruta o PII innecesaria;
- URLs de acceso temporales y firmadas;
- retención y eliminación controlada;
- logs nunca deben copiar el contenido de firmas, documentos o imágenes.

# 6. Derechos de los titulares
El sistema y los procesos deben soportar:
- conocer/consultar datos;
- actualizar;
- rectificar;
- solicitar supresión cuando proceda;
- revocar autorización cuando proceda;
- conocer el uso dado a los datos.
## Entidad propuesta: data_subject_requests
- id
- tenant_id nullable según rol de Responsable;
- subject/customer/user reference;
- request_type: consult \| update \| correct \| delete \| revoke;
- status;
- received_at;
- due_at;
- resolved_at nullable;
- resolution;
- evidence/reference;
- assigned_to.
Tiempos legales de referencia: consultas hasta 10 días hábiles, con posible extensión de 5; reclamos hasta 15 días hábiles, con posible extensión de 8.

# 7. Retención y supresión
**Baseline operativo enlazado:** [Fuente Notion](https://app.notion.com/p/3e06ab0a330d819ea376f6f7628679f6).
No aplicar borrado indiscriminado. Los plazos técnicos definidos por ILVOX son **defaults de producto**, no se presentan como términos legales universales: una obligación legal/contractual, garantía, disputa o legal hold puede extenderlos y una finalidad agotada puede exigir supresión cuando proceda.
Media baseline: uploads incompletos 24 h; media operacional 12 meses desde orden terminal; media ligada a garantía hasta el mayor entre ese plazo y `warranty_expires_at + 90 días`; firma/PDF/evidencia de autorización-entrega 36 meses como default de producto. El acceso se bloquea antes del purge físico y `legal_hold` impide eliminación automática.
Telemetría baseline: application logs 30 días, traces 14 días, métricas detalladas 90 días; `audit_logs` 24 meses salvo hold/obligación superior.
Backups PostgreSQL tienen ventana PITR baseline de 14 días. Una supresión válida en producción no implica que una copia histórica desaparezca instantáneamente: los backups expiran por su ciclo protegido y, si se restaura una copia anterior, deben reaplicarse tombstones/acciones de supresión antes de volver a servicio.
Cuando exista obligación legal/contractual de conservar historia, una solicitud de supresión puede limitar el tratamiento activo sin necesariamente destruir registros que deban mantenerse.

# 12. Política y aviso de privacidad
Antes del piloto deben existir, como mínimo:
- Política de Tratamiento de Datos Personales de ILVOX;
- Aviso de Privacidad;
- Anexo/Acuerdo de Tratamiento de Datos con talleres;
- procedimiento de consultas/reclamos;
- canal para titulares;
- inventario de bases/categorías;
- matriz de finalidades;
- política de retención;
- procedimiento de incidentes;
- registro de proveedores/subencargados.
Debe designarse una **persona o área responsable de protección de datos** y de tramitar las solicitudes de titulares. La legislación exige la función; el cargo formal de “DPO” no es obligatorio como figura específica.

# 14. Impacto en el ERD
Entidades nuevas confirmadas para el diseño:
- `privacy_consents`;
- `data_subject_requests`;
- `privacy_security_incidents`;
- `legal_acceptances`.
## legal_acceptances
Registra aceptación versionada de documentos jurídicos de la relación taller ↔ ILVOX, distinta del consentimiento del cliente final.
Campos baseline:
- `id uuid PK`;
- `acceptance_scope varchar` — `global_user | tenant`;
- `tenant_id uuid nullable FK -> workshops.id` — obligatorio cuando `acceptance_scope='tenant'` y nulo cuando `acceptance_scope='global_user'`;
- `accepted_by_user_id uuid FK -> users.id`;
- `document_type varchar` — `terms | privacy_policy | dpa | commercial_terms | other`;
- `document_version varchar`;
- `document_hash varchar` — hash del documento exacto aceptado;
- `accepted_at timestamptz`;
- `ip_address inet nullable`;
- `user_agent text nullable`;
- `channel varchar` — web/admin/import, etc.;
- `created_at timestamptz`.
Constraints/reglas:
- una aceptación es **append-only**; no se persiste un status mutable `superseded` que obligue a reescribir evidencia;
- el estado efectivo superseded se deriva cuando existe una aceptación posterior aplicable del mismo `document_type`; una nueva versión crea una nueva fila;
- `accepted_by_user_id` debe representar un usuario autorizado para aceptar por el taller según política comercial;
- CHECK semántico: `scope='tenant'` exige `tenant_id NOT NULL`; `scope='global_user'` exige `tenant_id IS NULL`;
- `UNIQUE(tenant_id, accepted_by_user_id, document_type, document_version)` para scope tenant y unicidad equivalente por usuario/documento/versión para scope global;
- la evidencia debe conservar la versión/hash exactos del documento presentado;
- `legal_acceptances` no sustituye `privacy_consents`: una registra documentos contractuales del taller; la otra autorizaciones/finalidades de titulares de datos.
Además, customers, media_assets, messages, audit_logs, customer_payments y demás tablas con datos personales deberán quedar cubiertas por clasificación, finalidad, acceso y retención.



La especificación detallada RECEPTION-CONSENT-01, D-PRIV-01…05, mayoría de edad y bundle offline se conserva en [Diccionario 05](../domain/data-dictionary/05-privacy-and-offline.md).
