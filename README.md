# TallerMecario — Frontend

Base técnica del frontend de TallerMecario (React + TypeScript estricto + Vite) sobre la que se construirán las pantallas del taller; este repositorio no implementa todavía ningún módulo de negocio.

## Requisitos

- **Node.js 22** (`>=22.22.2 <23`). `.nvmrc` fija la línea `22`; usa `nvm use` o instala Node 22 antes de continuar.
- **npm** (el que acompaña a Node 22). El repositorio incluye `package-lock.json` y `.npmrc` con `engine-strict=true`: la instalación falla fuera de Node 22 en lugar de continuar en un entorno no validado.

## Instalación y arranque

```bash
npm ci                 # instalación reproducible desde package-lock.json
npm run dev            # servidor de desarrollo en http://localhost:5173
npm run dev -- --host  # expone el servidor en la red local (probar en tablet/móvil)
npm run build          # build de producción en dist/
npm run preview        # sirve dist/ en http://localhost:4173
```

Los puertos son fijos (`strictPort`): si `5173` o `4173` están ocupados, el servidor se detiene en lugar de cambiar de puerto.

## Scripts

| Script               | Comando                     | Qué hace                                                    |
| -------------------- | --------------------------- | ----------------------------------------------------------- |
| `npm run dev`        | `vite`                      | Servidor de desarrollo con recarga en caliente (5173).      |
| `npm run build`      | `vite build`                | Build de producción en `dist/`. **No ejecuta typecheck.**   |
| `npm run preview`    | `vite preview`              | Sirve el build de `dist/` (4173).                           |
| `npm run typecheck`  | `tsc -b`                    | Comprobación de tipos sobre las referencias de `tsconfig`.  |
| `npm run lint`       | `eslint . --max-warnings 0` | Lint con información de tipos; cero warnings permitidos.    |
| `npm test`           | `vitest run`                | Pruebas unitarias, una sola ejecución.                      |
| `npm run test:watch` | `vitest`                    | Pruebas en modo vigilancia.                                 |

`build` **no** incluye `typecheck`: ejecuta ambos por separado (es lo que hace el CI).

## Estructura de `src/`

```text
src/
├── main.tsx
├── vite-env.d.ts
├── app/
│   ├── App.tsx
│   ├── App.test.tsx
│   └── app.css
├── shared/
│   └── config/
│       ├── public-env.ts
│       └── public-env.test.ts
└── test/
    └── setup.ts
```

`src/features/<dominio>/` está **reservado** para las rebanadas de dominio y todavía no existe.

Límites de capas (resumen):

| Ubicación | Puede importar de | No puede importar de |
| --- | --- | --- |
| `src/main.tsx` | `@/app`, `@/shared` | — |
| `src/app/` | `@/shared`, `@/features` | — |
| `src/features/<dominio>/` | `@/shared` y su propio subárbol | `@/app`, otras features |
| `src/shared/` | su propio subárbol y librerías aprobadas | `@/app`, `@/features` |
| `src/test/` | librerías de prueba | ningún archivo de producción lo importa |

Entre capas se importa con `@/`; dentro de la misma capa se usan rutas relativas. Sin `export default` en `src/` (salvo configuraciones de herramientas), sin barrels `index.ts` y sin efectos secundarios al importar. El alias `@/` → `src/` se declara en `tsconfig.app.json` y en `vite.config.ts`. Los límites están reforzados por ESLint (`no-restricted-imports` / `no-restricted-syntax`); las garantías y limitaciones exactas están en la especificación.

## Variables de entorno públicas

Todo valor que empieza por `VITE_` se incrusta en el bundle del navegador: **nunca escribas secretos, tokens ni credenciales**.

| Variable | Obligatoria | Valores y formato |
| --- | --- | --- |
| `VITE_APP_ENV` | No | `local` · `staging` · `production`. Por defecto `local` en desarrollo y `production` en el build. |
| `VITE_API_BASE_URL` | No | **Origen** del backend: `https://api.ejemplo.com` (esquema + host + puerto opcional). |

`VITE_API_BASE_URL` se valida al arrancar y se normaliza a origen (`URL.origin`): solo se acepta la ruta `/`, se rechazan credenciales, `?`, `#` y esquemas distintos de http(s), y se exige `https` cuando `VITE_APP_ENV` no es `local`. Está **reservada**: se valida, pero no se consume hasta la tarea del cliente API. Un valor inválido muestra una pantalla de error con el nombre de la variable y el motivo, nunca su valor.

Para overrides locales, copia `.env.example` a `.env.local` (ignorado por git).

## Alcance de esta base técnica

**Incluido:** React 19 + TypeScript estricto + Vite, npm con lockfile, límites de capas verificados por lint, validación pública de entorno, pantalla inicial de verificación, pruebas mínimas y CI de frontend.

**No incluido** (requiere una especificación aprobada aparte): autenticación (Clerk), contexto de taller y RBAC, cliente HTTP funcional, recepción/clientes/vehículos, media (R2), service worker/manifest/IndexedDB/sincronización, sistema de diseño o tokens, routing, estado global o remoto, formularios, validación con librerías (Zod), E2E, cobertura con umbrales, SBOM, branch protection, fijado de acciones por SHA, Dependabot y despliegue (Cloudflare Pages).

**PWA y modo offline no están implementados:** no hay manifest ni service worker, de modo que esta base **no** puede considerarse instalable ni operable sin conexión.

## Documentación

- [AGENTS.md](AGENTS.md) — instrucciones para agentes en este repositorio.
- [docs/agents/](docs/agents/README.md) — módulos de reglas: arquitectura, API, autenticación, tenant/RBAC, recepción/privacidad, media, PWA/offline, UI y calidad.
- [docs/architecture/frontend-bootstrap-spec.md](docs/architecture/frontend-bootstrap-spec.md) — especificación de esta base técnica: árbol, dependencias, configuraciones, límites de capas y criterios de aceptación.
- [docs/architecture/frontend-boundary.md](docs/architecture/frontend-boundary.md) y [docs/quality/frontend-relevant-gates.md](docs/quality/frontend-relevant-gates.md).

## CI

`.github/workflows/frontend-ci.yml` (job `Frontend CI`) se dispara con `push` a `main` y con `pull_request`, y ejecuta pasos separados: `npm ci` → typecheck → lint → test → build → `npm audit --audit-level=critical` → escaneo de secretos con gitleaks. No usa secretos, no invoca el backend y solo accede al registro npm, a las acciones de GitHub y a la release de gitleaks verificada por sha256.

> Un build local no demuestra que el CI remoto, el despliegue, la instalación PWA ni la integración con el backend funcionen.

## Autenticación y contexto de taller (G1–G4)

- **Identidad:** Clerk (`@clerk/react`) se importa **solo** en `src/features/auth/clerk-session.tsx`; el resto del código depende del puerto `AuthSessionPort`. Clerk establece la identidad verificada; el backend de TallerMecario establece memberships y permisos.
- **Token:** se pide por petición (`getToken()`); nunca se guarda en estado de React, almacenamiento ni logs. Tras un `401` hay **un único** reintento con token fresco y el mismo `scope`.
- **Transporte:** `src/shared/api` implementa únicamente `GET` (sin mutaciones), con lista blanca de rutas `/api/v1/…`, validación de la URL final, `redirect: 'manual'`, `credentials: 'omit'` y `cache: 'no-store'`.
- **Sin cierre de sesión automático ante un 401 persistente** (decisión de producto pendiente, TA-09).
- **G5 pendiente de TA-01:** mientras no exista `contextSource` (contrato de contexto sin congelar), una sesión iniciada termina en `signed_in_context_pending`: **no** se llama al backend ni se concede acceso a talleres.
- **Sin persistencia:** el taller activo, la identidad y el token viven solo en memoria.

---

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
