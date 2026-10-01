# Especificación S3-B01 — Bootstrap y arquitectura mínima del frontend

- **Tarea:** Sprint 3 · Track B · S3-B01.
- **Rol del autor:** arquitecto (Claude). Implementa DeepSeek; revisa Codex.
- **Fecha de la especificación:** 2026-09-30 (America/Bogota).
- **Repositorio:** TallerMecario (frontend). Backend independiente: TallerMecarioB.
- **Estado de este documento:** especificación aprobable (revisión 2, 2026-09-30). **Nada de lo descrito aquí ha sido implementado, instalado ni ejecutado.** Todas las comprobaciones de las secciones 7 y 8 figuran como *Pendiente*.
- **Revisión 2 — cambios:** (1) `VITE_API_BASE_URL` se normaliza a **origen** y se rechazan rutas distintas de `/`; (2) límites de capas reforzados (relativos, importaciones dinámicas, infraestructura de pruebas) con sondas positivas/negativas y limitaciones explícitas; (3) CI incluye el mínimo del Security Baseline (escaneo de secretos + `npm audit`), se elimina la exclusión D-20; (4) eventos del workflow coherentes con AC-16.

**Aprobación técnica vs. precondiciones de arranque.** Son cosas distintas y no deben mezclarse:

| | Qué es | Estado |
| --- | --- | --- |
| Aprobación técnica de esta especificación | Las decisiones D-01…D-21, el árbol, las dependencias (5.1) y los criterios AC son los que DeepSeek implementa. | Especificación lista para revisión; ningún AC ejecutado. |
| Precondiciones de arranque (6.0) | Node 22 disponible y política de rama/worktree/versionado de la base documental resuelta por el usuario. | **Abiertas.** Condicionan *cuándo* se puede implementar/validar, no el contenido de la especificación. |
- **Alcance de esta entrega:** solo este archivo. No se creó `src/`, `package.json` ni configuraciones de implementación; no se instalaron dependencias; no se modificaron `AGENTS.md`, documentos compartidos ni el backend; no hubo commit, push ni merge.

Convención de lectura: los bloques de código marcados **normativo** son el contenido esperado del archivo. DeepSeek solo puede desviarse de ellos dentro de las reglas de la sección 6.1 (desviaciones permitidas).

---

## 1. Estado real encontrado

### 1.1 Repositorio (inspeccionado el 2026-09-30)

| Elemento | Hallazgo |
| --- | --- |
| Rama actual | `main` |
| HEAD | `7f470ab` — “Initial commit” (2026-09-30) |
| Remoto | `origin` → `https://github.com/IvanBy12/TallerMecario.git`; ramas: `main`, `origin/main` |
| `git worktree list` | Un único worktree: la raíz del repositorio (`main`). No hay worktrees adicionales. |
| Archivos **versionados** | `.gitignore`, `LICENSE`, `README.md` (1 línea: `# TallerMecario`) |
| Cambios **sin commit** del usuario | `M README.md` (reemplazado por 52 líneas de introducción a la documentación; 4 158 bytes, LF, sha256 `210b3138a74434c3740bde42b57a7577bfcec033616b90a7e7dfa10462f66349`); `?? AGENTS.md`; `?? docs/` (45 archivos al inspeccionar, más esta especificación) |
| Ausentes | `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.*`, `.nvmrc`, `.npmrc`, `eslint.config.*`, `index.html`, `src/`, `.github/`, `.env.example`, `.gitattributes`, `.editorconfig` |
| `.gitignore` existente | Plantilla genérica de Node ya versionada. Ya ignora `node_modules/`, `dist`, `coverage`, `*.tsbuildinfo`, `.env`, `.env.*` con excepción `!.env.example`, `.vite/`, `vite.config.*.timestamp-*`. No ignora `package-lock.json` (correcto). Contiene ruido heredado (Next.js, Nuxt, Gatsby, etc.) que **no se toca**. Verificado con `git check-ignore -v`. |
| `core.autocrlf` | `true` (Windows). Git avisa “LF will be replaced by CRLF” sobre `README.md`. |
| Ruta del repositorio | Dentro de OneDrive (`...\OneDrive\Documentos\Proyectos\TallerMecario`). Ver riesgo R-03. |

**Consecuencia:** el repositorio **no está vacío** ni listo para compilar: contiene documentación y reglas de agente sin commit. El bootstrap parte de cero en código, pero debe convivir con ese trabajo sin sobrescribirlo (`README.md` modificado, `AGENTS.md`, `docs/`).

### 1.2 Herramientas disponibles en esta máquina

| Herramienta | Versión detectada | Observación |
| --- | --- | --- |
| Node.js | **v26.4.0** | **No es Node 22.** No se detectó `nvm`, `fnm` ni `volta`. Ver R-01. |
| npm | 11.17.0 | Node 22 incluye npm 10.9.x. |
| git | 2.55.0.windows.3 | |
| `rg` | no disponible en el PATH de Git Bash | Usar `git grep` en las comprobaciones. |

### 1.3 Documentación leída (solo lo necesario)

- `AGENTS.md` (núcleo) y módulos `docs/agents/architecture-rules.md`, `quality-workflow-rules.md`, `git-worktree-rules.md`, más `docs/agents/ui-rules.md` (por la pantalla inicial) y `docs/agents/README.md`.
- `docs/architecture/frontend-boundary.md` (stack, seguridad, límites), `docs/product/mvp-and-sprint-scope.md` (hoja de ruta y Sprint 3), `docs/quality/frontend-relevant-gates.md` (§1 gate transversal), `docs/security/frontend-security.md` (§1–2 secretos), `docs/OPEN-QUESTIONS.md` (completo, es corto), búsquedas dirigidas de “manifest / service worker / workbox” en `docs/architecture/pwa-offline.md` y `docs/decisions/ADR-005-pwa-offline.md`.
- **No leídos por estar fuera del alcance:** contratos HTTP (`docs/api/*`), RBAC, privacidad, media, diccionarios de datos.

### 1.4 Verificación de versiones (2026-09-30)

Fuentes: `npm view <paquete> version engines peerDependencies` (registro npm, solo lectura), `https://nodejs.org/dist/index.json`, `nodejs/Release/schedule.json` y la API de releases de GitHub. **No se ejecutó `npm install`, `tsc`, `vite`, `vitest` ni `eslint`.** La compatibilidad indicada se deriva de los metadatos `engines`/`peerDependencies` publicados, no de una ejecución.

| Paquete | Última versión | `engines.node` / peer relevante |
| --- | --- | --- |
| Node 22 (LTS “Jod”) | v22.23.3 (2026-09-23), npm 10.9.9 | Mantenimiento desde 2025-10-21; **fin de vida 2027-04-30** |
| react / react-dom | 19.3.0 | react-dom peer `react ^19.3.0` |
| vite | 8.3.1 | node `^20.19.0 \|\| >=22.12.0`; peer opcional `@types/node ^20.19.0 \|\| >=22.12.0` |
| @vitejs/plugin-react | 6.1.1 | node `^20.19.0 \|\| >=22.12.0`; peer `vite ^8.0.0` |
| typescript | **7.0.2 (`latest`)**; línea 6.x: **6.0.3** | — |
| typescript-eslint | 8.71.0 | node `^18.18.0 \|\| ^20.9.0 \|\| >=21.1.0`; peer `eslint ^8.57 \|\| ^9 \|\| ^10`; **peer `typescript >=4.8.4 <6.1.0`** |
| eslint | 10.11.0 | node `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| @eslint/js | 10.0.1 | peer `eslint ^10.0.0` |
| eslint-plugin-react-hooks | 7.1.1 | node `>=18`; peer eslint hasta `^10.0.0` |
| vitest | 5.0.3 | node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; peer `vite ^6.4 \|\| ^7 \|\| ^8`, `jsdom *`, `@types/node ^22 \|\| >=24` |
| jsdom | 30.1.1 | node **`^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`** |
| @testing-library/react | 16.3.3 | peers: `@testing-library/dom ^10`, react/react-dom/@types `^18 \|\| ^19` |
| @testing-library/dom | 10.4.2 | — |
| @types/react, @types/react-dom | 19.3.0 | — |
| @types/node | 26.6.3 (`latest`); línea 22.x: **22.20.4** | — |
| actions/checkout | v7.0.1 (2026-07-20) | — |
| actions/setup-node | v7.0.0 (2026-07-14) | — |

**Hallazgos que determinan decisiones:**

1. El mínimo efectivo de Node 22 lo fija **jsdom 30.1.1: `22.22.2`**.
2. **TypeScript 7.0.2 es `latest` pero typescript-eslint 8.71.0 exige `typescript <6.1.0`.** Se fija TypeScript en la línea 6.0.x.
3. Todas las versiones mayores (Vite 8, Vitest 5, ESLint 10, TypeScript 6, jsdom 30, plugin-react 6) son recientes; ver R-04.

---

## 2. Alcance y exclusiones

### 2.1 Dentro del bootstrap

- Node.js 22 fijado (`.nvmrc`, `engines`, `engine-strict`, CI).
- React + TypeScript estricto + Vite, con npm y `package-lock.json`.
- Estructura mínima `app` / `shared` (y `features` como límite reservado y protegido por lint, **sin carpeta hasta que exista una feature real**).
- Alias `@/` → `src/` y reglas de importación.
- Configuración pública de entorno validada + `.env.example`.
- `.gitignore` (ampliación aditiva), `.gitattributes`, `.editorconfig`.
- Scripts separados: `typecheck`, `lint`, `test`, `build` (+ `dev`, `preview`, `test:watch`).
- Pruebas mínimas (Vitest + Testing Library).
- Pantalla inicial de verificación de ejecución.
- README técnico (añadido **sin reemplazar** el contenido existente).
- CI básico de frontend, independiente del backend, que incluye el **mínimo de seguridad del Security Baseline**: escaneo de secretos (§2) y escaneo de dependencias (§18) — ver D-20.

### 2.2 Fuera del bootstrap (no implementar, no instalar)

Clerk/autenticación · contexto de taller y RBAC · cliente HTTP funcional · recepción, clientes, vehículos · media/R2 · service worker, manifest, IndexedDB, sincronización · sistema de diseño/tokens · routing · gestión de estado remoto o global · formularios · validación con librerías (Zod) · E2E · cobertura con umbrales · SBOM, branch protection, pin de acciones por SHA, Dependabot (endurecimiento posterior, ver R-08/R-09) · despliegue (Cloudflare Pages).

**Dependencias explícitamente NO aprobadas por esta especificación** (cualquiera requiere una especificación aprobada aparte): `react-router`, `@tanstack/react-query`, `zustand`/`redux`, `zod`, `axios`, Tailwind/CSS-in-JS/UI kits, `@clerk/*`, `vite-plugin-pwa`/`workbox`, `idb`/`dexie`, `prettier`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw`, `playwright`/`cypress`, `husky`/`lint-staged`, `eslint-plugin-jsx-a11y`, `eslint-plugin-boundaries`, `@vitest/coverage-*`, `globals`, `eslint-plugin-react-refresh`.

La aprobación de dependencias de esta especificación se limita **exactamente** a la tabla de la sección 5.1.

### 2.3 Regla de frontera frontend/backend que el bootstrap respeta

El frontend no contiene secretos, no decide autorización, no deriva DTOs de SQL ni inventa endpoints. En el bootstrap **no existe ninguna petición de red** (criterio AC-07).

---

## 3. Decisiones y justificación

| ID | Decisión | Justificación |
| --- | --- | --- |
| D-01 | **npm + `package-lock.json`** versionado; CI con `npm ci`. | `AGENTS.md` no fija gestor; npm viene con Node y evita añadir corepack/pnpm. El lockfile cumple “reusar convenciones de lockfile”. El lockfile debe generarse con Node 22 / npm 10. |
| D-02 | **Node 22**: `.nvmrc` = `22`; `engines.node` = `>=22.22.2 <23`; `.npmrc` con `engine-strict=true`; CI usa `node-version-file: .nvmrc`. | `AGENTS.md` fija baseline Node 22. `22.22.2` es el mínimo exigido por jsdom 30.1.1 (vitest ≥22.12, eslint ≥22.13, vite ≥22.12). `.nvmrc` = `22` toma el último 22.x (hoy 22.23.3) y recibe parches de seguridad sin editar el repo. `engine-strict` evita validar en otro Node por accidente. Fin de vida de Node 22: 2027-04-30 (R-06). |
| D-03 | **React 19.3 + react-dom**, renderizado en `StrictMode`. Sin librerías de estado/routing. | Stack obligatorio. Regla de arquitectura: librerías de estado/routing requieren especificación aprobada; el bootstrap tiene una sola pantalla. |
| D-04 | **Vite 8.3.x + @vitejs/plugin-react 6.1.x** (peer `vite ^8`). | Stack obligatorio. Versiones compatibles con Node ≥22.12 según `engines`. |
| D-05 | **TypeScript `~6.0.3`** (no 7.x). | typescript-eslint 8.71.0 declara `typescript <6.1.0`. Instalar `latest` (7.0.2) rompería el peer y empujaría a `--legacy-peer-deps`, prohibido. Revisar cuando typescript-eslint soporte 7 (R-05). |
| D-06 | **ESLint 10 (flat config) + typescript-eslint `strictTypeChecked` + reglas `react-hooks`**. Los comentarios `eslint-disable` quedan **prohibidos** por configuración (`linterOptions.noInlineConfig: true`). | Reglas de arquitectura: sin `any` injustificado, sin aserciones inseguras, sin diagnósticos suprimidos. Typed linting detecta `any` implícito y promesas sin manejar. Las reglas de `react-hooks` se registran manualmente (2 reglas) para no depender de nombres de presets no verificables sin instalar. |
| D-07 | **Vitest 5 + jsdom 30 + @testing-library/react 16 (+ `@testing-library/dom` 10 como peer)**; sin `globals`, sin jest-dom, sin user-event. | Mínimo para probar lógica pura y un componente. Importaciones explícitas de `vitest` (estricto, sin tipos globales). `cleanup` explícito en `src/test/setup.ts` porque, sin globals, RTL no auto-limpia. jest-dom/user-event se aprobarán cuando haya formularios/interacciones. |
| D-08 | **Sin formateador** (Prettier no aprobado). `.editorconfig` + `.gitattributes` (`eol=lf`). | Cero dependencias; evita diffs CRLF/LF entre Windows local y CI Linux (`core.autocrlf=true` detectado). |
| D-09 | **Capas**: `src/main.tsx` (entrada) · `src/app/` (raíz de composición) · `src/shared/` (código reutilizable sin conocimiento de dominio) · `src/features/<dominio>/` (**reservado**, no se crea) · `src/test/` (infraestructura de pruebas). | Requisito de límites claros sin carpetas vacías ni abstracciones especulativas. Reglas detalladas en 3.1. |
| D-10 | **Alias único `@/` → `src/`**; exportaciones nombradas (sin `export default` en `src/`); sin archivos barrel `index.ts`. | Un solo alias evita ambigüedad. Barrels favorecen ciclos e imports con efectos secundarios (regla de arquitectura). |
| D-11 | **Entorno público**: solo `VITE_APP_ENV` y `VITE_API_BASE_URL`, validados por una función pura `parsePublicEnv`; sin Zod; `envPrefix` se deja en el valor por defecto `VITE_`. | Requisito de “configuración pública de entorno”. `VITE_API_BASE_URL` es el **origen** del backend (esquema + host + puerto opcional), no un endpoint ni contrato; se valida y se **normaliza a origen** (`URL.origin`), aceptando solo la ruta `/`. No decide prefijos de versión (`/api/v1`…) ni rutas: eso pertenece a la tarea del cliente API. Se valida pero **no se consume** hasta esa tarea. Regla https fuera de `local`: Security Baseline “TLS/HTTPS en todo tránsito”. Nunca secretos (Security Baseline §1). |
| D-12 | **`build` = `vite build` (sin typecheck)**; `typecheck` = `tsc -b`; scripts independientes. | `quality-workflow-rules`: “no asumir que build incluye typechecking”. |
| D-13 | **Puertos fijos con `strictPort`**: dev `5173`, preview `4173`; host por defecto (solo localhost). | Origen predecible para futuros CORS/allowed-origins de backend y proveedor de identidad. Exposición en LAN para probar tablet/móvil es opt-in: `npm run dev -- --host`. |
| D-14 | **CSS plano, un archivo**, colores solo con palabras clave del sistema (`Canvas`, `CanvasText`), `color-scheme: light dark`; UI en español (`lang="es"`). | `ui-rules`: “no inventar un sistema de diseño final” y FE-DOC-16 (no hay tokens aprobados). |
| D-15 | **PWA diferida por completo**: sin manifest, sin service worker, sin plugin, sin `public/`. | La documentación (`ADR-005`, `pwa-offline.md`) declara “PWA React/Vite + service worker” pero no fija plugin, estrategia de caché ni manifest. Decidirlo ahora sería especulativo; `pwa-offline-rules` exige tratarlo aparte. **El bootstrap no puede afirmar instalabilidad PWA.** |
| D-16 | **CI**: un workflow, un job; pasos separados `npm ci` → typecheck → lint → test → build → dependency scan → secret scan; sin secretos, sin llamadas al backend. | “CI frontend básico e independiente del backend”. |
| D-17 | **`README.md`**: se **antepone** la sección técnica y se conserva **byte a byte** el contenido actual sin commit. `.gitignore`: solo se **añade** un bloque al final. | “No sobrescribas trabajo existente”. |
| D-18 | **Sin `features/` ni `public/` ni `src/shared/ui|api|lib`** hasta que exista contenido real. | “Evita carpetas vacías y abstracciones especulativas”. Git no versiona directorios vacíos de todos modos. |
| D-19 | **Límites de capas reforzados por lint** con `no-restricted-imports` + `no-restricted-syntax` (núcleo de ESLint, sin plugin), verificados con sondas positivas y negativas. Garantías exactas y limitaciones en 3.2. | Un límite solo documentado se erosiona. No se afirma más cobertura de la que el lint puede dar. |
| D-20 | **El CI incluye el mínimo del Security Baseline:** (a) `npm audit --audit-level=critical` bloqueante (no añade dependencia); (b) escaneo de secretos con **gitleaks 8.30.1** (binario descargado con sha256 fijado, historial completo). | Security Baseline §2: “Secret scanning obligatorio en CI”; §18: “Dependency scanning en CI… Vulnerabilidades críticas bloquean release” (y `frontend-boundary.md` §14: “análisis de vulnerabilidades en CI”). El texto no condiciona estos requisitos a un sprint; el Gate S14 solo los *revalida*. Diferirlos exigiría una excepción explícita del usuario, que no existe; por eso se incluyen. gitleaks no es dependencia npm ni del bundle: es una herramienta de CI aprobada por esta especificación (versión y checksum verificados el 2026-09-30 contra la release v8.30.1 de 2026-03-21). No requiere secretos ni licencia para repositorios de cuenta personal. |
| D-21 | **Rama y evento de validación de CI**: el workflow se dispara con `pull_request` y con `push` a `main`; el primer run remoto lo origina la apertura de un PR contra `main` desde una rama dedicada (8, AC-16). | Ver el workflow (5.2) y AC-16. Push/PR solo con autorización explícita del usuario. |

### 3.1 Responsabilidad y límites de cada carpeta

| Ubicación | Responsabilidad | Puede importar de | No puede importar de |
| --- | --- | --- | --- |
| `src/main.tsx` | Punto de entrada: lee entorno, monta React. **Único archivo con efecto de montaje al importarse.** | `@/app`, `@/shared` | — |
| `src/app/` | Raíz de composición: componente `App`, estilos globales. Futuro: providers, router, guards, cableado de features. | `@/shared`, `@/features` (cuando existan) | — |
| `src/features/<dominio>/` (**reservado**) | Rebanada vertical por dominio (p. ej. auth, customers, reception). Contiene UI, estado y acceso a datos propios del dominio. | `@/shared` y su propio subárbol (relativo) | `@/app`, otras features |
| `src/shared/` | Código reutilizable **sin conocimiento de ninguna feature** (config, y luego API base, UI genérica, utilidades). Subcarpetas por propósito, creadas **solo** cuando exista el primer módulo. | Solo su propio subárbol y librerías aprobadas | `@/app`, `@/features` |
| `src/test/` | Infraestructura de pruebas (`setup.ts`). | librerías de prueba | Solo la importan archivos `*.test.*` y la configuración de Vitest; **ningún archivo de producción** |

Reglas de importación (aplican a todo `src/`):

1. Entre capas se importa con `@/…`. Dentro de la misma capa/feature se usan rutas relativas (`./`, `../`).
2. `shared` ⟂ `app` y `features`. `features` ⟂ `app` y otras features (`@/features/**` está prohibido desde `src/features/**`; dentro de una feature se usa ruta relativa).
3. Exportaciones nombradas; sin `export default` en `src/` (excepción: `vite.config.ts`, `eslint.config.js` por requisito de herramienta).
4. Sin barrels. Sin efectos secundarios al importar (salvo `main.tsx` y el CSS importado desde él).
5. Sin peticiones de red en componentes presentacionales (hoy no hay ninguna petición). Cuando se introduzcan: estado remoto, estado de UI y borradores persistidos se mantienen separados (`architecture-rules`).
6. Nombres: componentes React `PascalCase.tsx`; el resto `kebab-case.ts`; pruebas junto al módulo (`*.test.ts` / `*.test.tsx`).
7. Sin `any` injustificado, sin `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`, sin `eslint-disable`, sin aserciones `as` de objeto literal, sin `!` no-null.

### 3.2 Qué garantiza exactamente el lint de capas (y qué no)

Mecanismo: reglas del núcleo de ESLint, sin plugins (`no-restricted-imports` con `patterns`, `no-restricted-syntax` con selectores AST, más `@typescript-eslint/no-require-imports` ya incluida en `strictTypeChecked`). El bloque normativo está en `eslint.config.js` (5.2). **Los mecanismos concretos (`patterns[].regex`, patrones gitignore con `**`, selectores) no se han ejecutado; la garantía vigente es únicamente la que demuestren las sondas de 7.5.** Si una sonda no se comporta como se indica, aplica 6.1 (cambiar el mecanismo manteniendo el resultado) y se reporta.

**Garantizado automáticamente (si todas las sondas de 7.5 se comportan como se espera):**

| Regla | Cobertura |
| --- | --- |
| `shared` no depende de `app` ni `features` | Importaciones estáticas (`import`, `import type`, `export … from`, `export *`) por alias **o** por ruta relativa (cualquier especificador con un segmento `app` o `features`). |
| `features` no depende de `app` | Igual que arriba, alias y relativas. |
| `features` no depende de otras features | Alias `@/features/**` prohibido. Relativas que **salen** de la raíz de su propia feature: bloqueadas según la profundidad del archivo (`src/features/<f>/` + hasta 3 subcarpetas con regla exacta; 4 o más subcarpetas: cualquier `../` bloqueado). |
| `app` y `src/main.tsx` no cruzan capas por ruta relativa | En `src/app/**`, una importación relativa que salga de `src/app` se bloquea por profundidad (igual que features). En `src/*.ts(x)` (p. ej. `main.tsx`) toda importación relativa se bloquea: se usa `@/`. |
| Producción no importa infraestructura de pruebas | En todo archivo de `src/` que no sea `*.test.*` ni `src/test/**`: bloqueados los especificadores con segmento `test` (`@/test/**`, relativos) y los paquetes `vitest`, `vitest/**`, `@testing-library/**`, `jsdom`. |
| Importaciones dinámicas | En `shared` y `features`: **cualquier** `import()` está prohibido. En el resto de `src/`: `import()` con especificador no literal prohibido. Tipos `import('…')` (`TSImportType`) y `import.meta.glob` prohibidos en todo `src/`. `require` prohibido (`no-require-imports`). |

**No garantizado (no se afirma cobertura automática; lo vigila la revisión de Codex o queda como limitación documentada):**

1. `import()` con especificador literal dentro de `src/app/**` o `src/main.tsx` hacia una capa o infraestructura de pruebas prohibida (p. ej. `import('@/test/setup')`): `app` puede importar todo por diseño y el selector no puede filtrar por valor de forma fiable. Las importaciones estáticas de infraestructura de pruebas sí están cubiertas.
2. Cadenas en utilidades de pruebas (`vi.mock('…')`, `vi.importActual('…')`) y cualquier especificador construido fuera de una sentencia de importación.
3. Ciclos de importación dentro de una capa o feature (no hay `import/no-cycle` aprobado; `tsc` no los detecta).
4. Efectos secundarios al importar un módulo (la regla 4 de 3.1 es de revisión).
5. Importaciones relativas entre features desde archivos con 4 o más subcarpetas: se bloquean **todas** las `../` (conservador), no se distingue el destino.
6. Cualquier archivo fuera de `src/` (p. ej. `vite.config.ts`).
7. Los bloques de `features/` no se ejercitan con código real (no hay features): solo las sondas 7.5 demuestran que funcionan; hay que repetirlas cuando se cree la primera feature.
8. El alias `@/` vive en `tsconfig.app.json` y `vite.config.ts` (riesgo de deriva, R-07); el lint no lo vigila.
9. Falsos positivos posibles: cualquier especificador de paquete que contenga un segmento `app`, `features` o `test`. Se acepta; se reporta, no se suprime.

---

## 4. Árbol exacto de archivos del bootstrap

`(nuevo)` = se crea · `(modifica)` = se edita de forma aditiva · `(generado)` = lo produce `npm install`.

```text
TallerMecario/
├── .editorconfig                      (nuevo)
├── .env.example                       (nuevo)
├── .gitattributes                     (nuevo)
├── .gitignore                         (modifica: solo añadir bloque al final)
├── .github/
│   └── workflows/
│       └── frontend-ci.yml            (nuevo)
├── .npmrc                             (nuevo)
├── .nvmrc                             (nuevo)
├── README.md                          (modifica: anteponer sección técnica)
├── eslint.config.js                   (nuevo)
├── index.html                         (nuevo)
├── package.json                       (nuevo)
├── package-lock.json                  (generado)
├── tsconfig.json                      (nuevo)
├── tsconfig.app.json                  (nuevo)
├── tsconfig.node.json                 (nuevo)
├── vite.config.ts                     (nuevo)
└── src/
    ├── main.tsx                       (nuevo)
    ├── vite-env.d.ts                  (nuevo)
    ├── app/
    │   ├── App.tsx                    (nuevo)
    │   ├── App.test.tsx               (nuevo)
    │   └── app.css                    (nuevo)
    ├── shared/
    │   └── config/
    │       ├── public-env.ts          (nuevo)
    │       └── public-env.test.ts     (nuevo)
    └── test/
        └── setup.ts                   (nuevo)
```

**No deben existir** tras el bootstrap: `src/features/`, `public/`, `src/shared/ui|api|lib`, `index.ts` barrels, `.prettierrc*`, `vitest.config.ts`, `.env`/`.env.local`, `manifest*`, `sw*`, `docs/**` modificados. Los archivos preexistentes sin commit (`AGENTS.md`, `docs/**`) no se modifican.

---

## 5. Dependencias y configuraciones

### 5.1 Dependencias aprobadas (únicas)

| Paquete | Rango en `package.json` | Tipo | Para qué / por qué este |
| --- | --- | --- | --- |
| `react` | `^19.3.0` | dependencies | Librería de UI obligatoria. |
| `react-dom` | `^19.3.0` | dependencies | Render en navegador. |
| `vite` | `^8.3.1` | devDependencies | Bundler/dev server obligatorio. |
| `@vitejs/plugin-react` | `^6.1.1` | devDependencies | JSX/Fast Refresh (peer `vite ^8`). |
| `typescript` | `~6.0.3` | devDependencies | TS estricto; **no subir a 7.x** (D-05). |
| `@types/node` | `~22.20.4` | devDependencies | Tipos de `node:url` en `vite.config.ts`; alineado con Node 22. Peer de vite/vitest satisfecho. |
| `@types/react` | `^19.3.0` | devDependencies | Tipos React. |
| `@types/react-dom` | `^19.3.0` | devDependencies | Tipos react-dom. |
| `eslint` | `^10.11.0` | devDependencies | Linter. |
| `@eslint/js` | `^10.0.1` | devDependencies | Reglas recomendadas base. |
| `typescript-eslint` | `^8.71.0` | devDependencies | Reglas TS con información de tipos. |
| `eslint-plugin-react-hooks` | `^7.1.1` | devDependencies | `rules-of-hooks`, `exhaustive-deps`. |
| `vitest` | `^5.0.3` | devDependencies | Runner de pruebas (reutiliza la config de Vite). |
| `jsdom` | `^30.1.1` | devDependencies | Entorno DOM para pruebas de componentes. |
| `@testing-library/react` | `^16.3.3` | devDependencies | Render/consultas accesibles. |
| `@testing-library/dom` | `^10.4.2` | devDependencies | Peer obligatorio de `@testing-library/react`. |

Total: 2 dependencias + 14 devDependencies. Cualquier paquete adicional que aparezca en `package.json` incumple AC-14.

### 5.2 Archivos de configuración (normativos)

**`.nvmrc`**
```text
22
```

**`.npmrc`**
```ini
engine-strict=true
```

**`.gitattributes`**
```gitattributes
* text=auto eol=lf
```

**`.editorconfig`**
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

**`.gitignore` — añadir al final (no editar líneas existentes):**
```gitignore

# --- TallerMecario frontend (S3-B01) ---
# Editores y sistema operativo
.idea/
.vscode/
.DS_Store
Thumbs.db
```
`.env`, `.env.*` (con `!.env.example`), `dist`, `coverage`, `node_modules/`, `*.tsbuildinfo` ya están cubiertos.

**`.env.example`**
```dotenv
# Solo configuración PÚBLICA. Todo valor VITE_* se incrusta en el bundle del navegador.
# NUNCA escribas secretos, tokens, claves privadas ni credenciales aquí ni en ningún .env.
# Para overrides locales copia este archivo a .env.local (ignorado por git).

# Opcional. Valores: local | staging | production
# Si no se define: "local" en el servidor de desarrollo, "production" en el build de producción.
VITE_APP_ENV=local

# Opcional. ORIGEN del backend: esquema + host + puerto opcional (p. ej. https://api.ejemplo.com).
# Solo se acepta la ruta "/" (o ninguna): no incluyas rutas ni prefijos de versión.
# Sin credenciales, '?' ni '#'. Se normaliza a origen (minúsculas, sin puerto por defecto ni "/" final).
# Se permite http solo cuando VITE_APP_ENV=local.
# Reservado: se valida al arrancar; no se usa hasta la tarea del cliente API.
VITE_API_BASE_URL=
```

**`package.json`** (las versiones exactas resueltas las fija `package-lock.json`)
```json
{
  "name": "tallermecario-frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.22.2 <23"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@testing-library/dom": "^10.4.2",
    "@testing-library/react": "^16.3.3",
    "@types/node": "~22.20.4",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "eslint": "^10.11.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "jsdom": "^30.1.1",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.71.0",
    "vite": "^8.3.1",
    "vitest": "^5.0.3"
  }
}
```

**`tsconfig.json`** (solución; no compila nada por sí mismo)
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**`tsconfig.app.json`**
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "paths": { "@/*": ["./src/*"] },
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```
Nota: `paths` sin `baseUrl` es intencional (no declarar `baseUrl`).

**`tsconfig.node.json`**
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

**`vite.config.ts`**
```ts
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
```
Prohibido en este archivo: `envPrefix`, `define` con `process.env`, `loadEnv` sin prefijo, `build.sourcemap: true`, `base`, plugins adicionales.

**`eslint.config.js`**
```js
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const TEST_FILES = '**/*.test.{ts,tsx}';
const APP_AND_FEATURES = ['**/app', '**/app/**', '**/features', '**/features/**'];

const TEST_INFRA_PATTERNS = [
  {
    group: ['**/test', '**/test/**'],
    message: 'El código de producción no importa infraestructura de pruebas (src/test).',
  },
  {
    group: ['vitest', 'vitest/**', '@testing-library/**', 'jsdom'],
    message: 'Las librerías de prueba solo se importan desde *.test.* y src/test.',
  },
];

const DYNAMIC_IMPORT_NON_LITERAL = {
  selector: "ImportExpression:not([source.type='Literal'])",
  message: 'import() solo con especificador literal.',
};
const ANY_DYNAMIC_IMPORT = {
  selector: 'ImportExpression',
  message: 'shared y features no usan import(); la carga diferida se declara en app.',
};
const IMPORT_TYPE = {
  selector: 'TSImportType',
  message: 'No uses tipos import("…"); usa import type.',
};
const IMPORT_META_GLOB = {
  selector: "CallExpression[callee.object.type='MetaProperty'][callee.property.name='glob']",
  message: 'import.meta.glob no está permitido.',
};
const BASE_SYNTAX = [DYNAMIC_IMPORT_NON_LITERAL, IMPORT_TYPE, IMPORT_META_GLOB];

/** Archivos de producción: patrones de capa + infraestructura de pruebas. Archivos *.test.*: solo patrones de capa. */
function importRules(files, patterns) {
  return [
    {
      files,
      ignores: [TEST_FILES],
      rules: {
        'no-restricted-imports': ['error', { patterns: [...patterns, ...TEST_INFRA_PATTERNS] }],
      },
    },
    {
      files: files.map((file) => file.replace('*.{ts,tsx}', '*.test.{ts,tsx}')),
      rules: { 'no-restricted-imports': ['error', { patterns }] },
    },
  ];
}

/** Bloquea rutas relativas que salen de `base` según la profundidad del archivo (0-3 exactas; 4+ bloquea todo `../`). */
function escapeRelative(depth, message) {
  return { regex: depth >= 4 ? '^\\.\\./' : `^(\\.\\./){${depth + 1},}`, message };
}

function subtreeImportRules(base, extraPatterns, message) {
  const blocks = [];
  for (let depth = 0; depth < 4; depth += 1) {
    blocks.push(
      ...importRules(
        [`${base}/${'*/'.repeat(depth)}*.{ts,tsx}`],
        [...extraPatterns, escapeRelative(depth, message)],
      ),
    );
  }
  blocks.push(
    ...importRules(
      [`${base}/${'*/'.repeat(4)}**/*.{ts,tsx}`],
      [...extraPatterns, escapeRelative(4, message)],
    ),
  );
  return blocks;
}

export default defineConfig([
  globalIgnores(['dist/', 'coverage/']),
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],
    },
  },
  {
    files: ['vite.config.ts'],
    rules: { 'no-restricted-exports': 'off' },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
  },
  // --- Límites de capas (garantías y limitaciones: sección 3.2) ---
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...BASE_SYNTAX] },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ANY_DYNAMIC_IMPORT, IMPORT_TYPE, IMPORT_META_GLOB] },
  },
  ...importRules(
    ['src/shared/**/*.{ts,tsx}'],
    [{ group: APP_AND_FEATURES, message: 'shared no puede depender de app ni de features.' }],
  ),
  ...subtreeImportRules(
    'src/features/*',
    [
      { group: ['**/app', '**/app/**'], message: 'Una feature no puede depender de app.' },
      { group: ['@/features', '@/features/**'], message: 'Una feature no importa otras features.' },
    ],
    'Una feature no importa fuera de su propia carpeta con rutas relativas.',
  ),
  ...subtreeImportRules(
    'src/app',
    [],
    'app usa @/ para otras capas; las rutas relativas no pueden salir de src/app.',
  ),
  ...importRules(
    ['src/*.{ts,tsx}'],
    [{ regex: '^\\.', message: 'El punto de entrada importa con @/, no con rutas relativas.' }],
  ),
]);
```

Justificación de la estructura: en configuración plana, un bloque posterior **reemplaza** (no fusiona) las opciones de una misma regla para los archivos que coinciden; por eso `importRules` compone en cada bloque los patrones de capa + los de infraestructura de pruebas (producción) o solo los de capa (archivos `*.test.*`, que sí pueden importar `src/test` y librerías de prueba pero **no** cruzar capas).

**`index.html`**
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TallerMecario</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
Sin scripts ni estilos en línea (mantiene abierta la puerta a una CSP estricta). Sin `<link rel="icon">`, manifest ni `theme-color` (la identidad visual y la PWA son tareas posteriores; FE-DOC-16).

**`.github/workflows/frontend-ci.yml`**
```yaml
name: Frontend CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Typecheck, lint, test, build and security checks
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout (full history for secret scanning)
        uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Show toolchain versions
        run: |
          node --version
          npm --version

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      - name: Dependency scan (critical vulnerabilities block)
        run: npm audit --audit-level=critical

      - name: Secret scan (gitleaks, full history)
        run: |
          curl -sSfL -o gitleaks.tar.gz \
            https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
          echo "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb  gitleaks.tar.gz" | sha256sum -c -
          tar -xzf gitleaks.tar.gz gitleaks
          ./gitleaks git --redact --no-banner --verbose .
          rm -f gitleaks gitleaks.tar.gz
```
El workflow no define `env`, no usa secretos ni `GITHUB_TOKEN` propio, no invoca el backend ni servicios externos salvo el registro npm, las acciones de GitHub y la descarga de la release de gitleaks (verificada por sha256). El checksum y la versión se tomaron de `gitleaks_8.30.1_checksums.txt` (2026-09-30). La sintaxis del subcomando `gitleaks git` y del workflow **no se han ejecutado** (AC-19).

**Eventos y primer run remoto.**

- `push` a `main`: valida lo que se integra.
- `pull_request`: valida los cambios de una rama antes de integrarlos.
- **No hay `workflow_dispatch`**: solo funciona con el archivo ya presente en la rama por defecto, así que no sirve para el primer run.
- Un `push` a una rama de trabajo **no** dispara el workflow (solo `main`).
- **Por tanto, el primer run remoto lo origina el evento `pull_request` al abrir un PR contra `main` desde la rama de implementación** (o, si el usuario autoriza integrar directamente, el `push` a `main`). Ambas acciones —push de la rama, creación del PR— requieren autorización explícita del usuario; esta especificación no las concede a DeepSeek. AC-16 sigue *Pendiente* hasta registrar la URL y el resultado real de ese run.
- Alcance de la protección: el workflow por sí solo no “bloquea el PR” (Security Baseline §2); eso requiere marcar el check como obligatorio en la protección de rama, ajuste del repositorio que queda como decisión pendiente del usuario (9.3, R-09).

### 5.3 Código fuente (normativo)

**`src/vite-env.d.ts`** — solo aumenta el tipo de variables públicas (`types: ["vite/client"]` ya aporta los tipos de Vite). Debe ser un archivo de script (sin `import`/`export`).
```ts
interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_API_BASE_URL?: string;
}
```

**`src/shared/config/public-env.ts`**
```ts
export const APP_ENV_NAMES = ['local', 'staging', 'production'] as const;

export type AppEnvName = (typeof APP_ENV_NAMES)[number];

export interface PublicEnv {
  readonly appEnv: AppEnvName;
  /**
   * Origen normalizado del backend (`URL.origin`: esquema + host + puerto no por defecto, sin "/" final).
   * No incluye rutas ni prefijos de versión. No se consume hasta la tarea del cliente API.
   */
  readonly apiOrigin: string | null;
}

export type PublicEnvVariable = 'VITE_APP_ENV' | 'VITE_API_BASE_URL';

export type PublicEnvIssueReason = 'unknown_value' | 'invalid_origin' | 'https_required';

/** Nunca incluye el valor recibido: solo el nombre de la variable y el motivo. */
export interface PublicEnvIssue {
  readonly variable: PublicEnvVariable;
  readonly reason: PublicEnvIssueReason;
}

export type PublicEnvResult =
  | { readonly ok: true; readonly env: PublicEnv }
  | { readonly ok: false; readonly issues: readonly PublicEnvIssue[] };

/** Subconjunto de ImportMetaEnv que se lee al arrancar. Todo valor VITE_* es público. */
export type PublicEnvSource = Pick<ImportMetaEnv, 'PROD' | 'VITE_APP_ENV' | 'VITE_API_BASE_URL'>;

function isAppEnvName(value: string): value is AppEnvName {
  return APP_ENV_NAMES.some((name) => name === value);
}

function readOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

/** Acepta solo http(s) con host, sin credenciales, '?' ni '#', y con ruta vacía o "/". */
function parseApiOrigin(raw: string): URL | null {
  if (/[?#]/.test(raw)) {
    return null;
  }
  try {
    const url = new URL(raw);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const hasCredentials = url.username !== '' || url.password !== '';
    return isHttp && !hasCredentials && url.pathname === '/' ? url : null;
  } catch {
    return null;
  }
}

export function parsePublicEnv(source: PublicEnvSource): PublicEnvResult {
  const issues: PublicEnvIssue[] = [];

  const rawAppEnv = readOptional(source.VITE_APP_ENV);
  let appEnv: AppEnvName | null;
  if (rawAppEnv === null) {
    appEnv = source.PROD ? 'production' : 'local';
  } else if (isAppEnvName(rawAppEnv)) {
    appEnv = rawAppEnv;
  } else {
    appEnv = null;
    issues.push({ variable: 'VITE_APP_ENV', reason: 'unknown_value' });
  }

  const rawApiBaseUrl = readOptional(source.VITE_API_BASE_URL);
  let apiOrigin: string | null = null;
  if (rawApiBaseUrl !== null) {
    const url = parseApiOrigin(rawApiBaseUrl);
    if (url === null) {
      issues.push({ variable: 'VITE_API_BASE_URL', reason: 'invalid_origin' });
    } else if (url.protocol === 'http:' && appEnv !== null && appEnv !== 'local') {
      issues.push({ variable: 'VITE_API_BASE_URL', reason: 'https_required' });
    } else {
      apiOrigin = url.origin;
    }
  }

  if (issues.length > 0 || appEnv === null) {
    return { ok: false, issues };
  }
  return { ok: true, env: { appEnv, apiOrigin } };
}
```
Semántica: `VITE_API_BASE_URL` es un **origen**. Se acepta `https://host`, `https://host/`, `https://host:8443`; se rechaza cualquier ruta distinta de `/` (`/api`, `/v1`, `//`), credenciales, `?`, `#` y esquemas distintos de http(s). El valor guardado es `url.origin` (host en minúsculas, puerto por defecto omitido, sin `/` final). No se deciden endpoints ni prefijos de versión. Si `VITE_APP_ENV` es inválido, la regla https **no** se evalúa (solo la validación del origen). Los valores ausentes y las cadenas vacías/solo espacios se tratan como “no definido”.

**`src/app/App.tsx`**
```tsx
import type {
  PublicEnv,
  PublicEnvIssue,
  PublicEnvIssueReason,
  PublicEnvResult,
} from '@/shared/config/public-env';

const ISSUE_MESSAGES: Record<PublicEnvIssueReason, string> = {
  unknown_value: 'valor no permitido (usa local, staging o production).',
  invalid_origin:
    'debe ser un origen http(s) (esquema, host y puerto opcional), sin credenciales, sin ruta distinta de "/", sin parámetros ni fragmento.',
  https_required: 'debe usar https cuando VITE_APP_ENV no es local.',
};

export interface AppProps {
  readonly envResult: PublicEnvResult;
}

export function App({ envResult }: AppProps) {
  return (
    <main className="app">
      <h1>TallerMecario</h1>
      {envResult.ok ? (
        <BootstrapStatus env={envResult.env} />
      ) : (
        <ConfigIssues issues={envResult.issues} />
      )}
    </main>
  );
}

function BootstrapStatus({ env }: { readonly env: PublicEnv }) {
  return (
    <>
      <p>Base técnica del frontend. Esta pantalla solo verifica que la aplicación se ejecuta.</p>
      <dl>
        <dt>Entorno</dt>
        <dd>{env.appEnv}</dd>
        <dt>API del backend</dt>
        <dd>{env.apiOrigin === null ? 'No configurada' : 'Configurada'}</dd>
      </dl>
    </>
  );
}

function ConfigIssues({ issues }: { readonly issues: readonly PublicEnvIssue[] }) {
  return (
    <div role="alert">
      <h2>Configuración pública inválida</h2>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.variable}:${issue.reason}`}>
            <code>{issue.variable}</code>: {ISSUE_MESSAGES[issue.reason]}
          </li>
        ))}
      </ul>
    </div>
  );
}
```
La pantalla **no** muestra el valor de `VITE_API_BASE_URL` (solo “Configurada / No configurada”) ni ningún dato personal.

**`src/main.tsx`**
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { parsePublicEnv } from '@/shared/config/public-env';

import '@/app/app.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App envResult={parsePublicEnv(import.meta.env)} />
  </StrictMode>,
);
```

**`src/app/app.css`** (sin paleta propia; solo colores del sistema)
```css
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: Canvas;
  color: CanvasText;
}

.app {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem;
}

dt {
  font-weight: 600;
}

dd {
  margin: 0 0 0.75rem;
}
```

**`src/test/setup.ts`**
```ts
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

### 5.4 Casos de prueba obligatorios (contenido exacto a cubrir)

Las pruebas importan `describe`, `it`, `expect` desde `'vitest'` (sin globals). Sin mocks de red, temporizadores ni `console`. Datos sintéticos.

**`src/shared/config/public-env.test.ts`** — función pura, entrada `{ PROD, VITE_APP_ENV?, VITE_API_BASE_URL? }`:

| # | Entrada | Resultado esperado |
| --- | --- | --- |
| 1 | `PROD:false`, nada más | `ok`, `appEnv:'local'`, `apiOrigin:null` |
| 2 | `PROD:true`, nada más | `ok`, `appEnv:'production'` |
| 3 | `VITE_APP_ENV:''` y `'   '` con `PROD:true` | tratado como no definido → `'production'` |
| 4 | `VITE_APP_ENV:'staging'`, `PROD:true` | `ok`, `'staging'` (la variable explícita prevalece) |
| 5 | `VITE_APP_ENV:'prod'` | `ok:false`, issues = `[{variable:'VITE_APP_ENV', reason:'unknown_value'}]` |
| 6 | `VITE_API_BASE_URL:'https://api.example.test'` con `production` | `ok`, `apiOrigin === 'https://api.example.test'` |
| 7 | `VITE_API_BASE_URL:'http://localhost:3000'` con `local` | `ok`, `apiOrigin === 'http://localhost:3000'` |
| 8 | `VITE_API_BASE_URL:'http://api.example.test'` con `staging` y con `production` | `ok:false`, reason `https_required` |
| 9 | `'no es url'`, `'ftp://x.example.test'`, `'https://user:pass@x.example.test'`, `'https://x.example.test/?a=1'`, `'https://x.example.test/?'`, `'https://x.example.test/#frag'` | `ok:false`, reason `invalid_origin` |
| 10 | `VITE_APP_ENV:'prod'` + `VITE_API_BASE_URL:'http://api.example.test'` | solo el issue de `VITE_APP_ENV` (no se evalúa https con entorno inválido) |
| 11 | `VITE_APP_ENV:'prod'` + `VITE_API_BASE_URL:'no es url'` | dos issues (ambas variables) |
| 12 | Cualquier caso `ok:false` con `'https://user:pass@x.example.test'` | `JSON.stringify(issues)` **no** contiene `user` ni `pass` (los issues nunca filtran valores) |
| 13 | Rutas: `'https://api.example.test/api'`, `'https://api.example.test/v1/'`, `'https://api.example.test//'` | `ok:false`, reason `invalid_origin` (no se decide ningún prefijo de versión) |
| 14 | Normalización: `'https://api.example.test/'`, `'  https://api.example.test  '`, `'HTTPS://API.Example.TEST:443/'` | `ok`, `apiOrigin === 'https://api.example.test'` en los tres |
| 15 | Puerto no por defecto: `'https://api.example.test:8443'` y `'https://api.example.test:8443/'` | `ok`, `apiOrigin === 'https://api.example.test:8443'` |

Nota: no añadir casos con segmentos `..`/`.` (la API `URL` los normaliza de forma dependiente de la implementación); usar solo los valores citados. El caso `'https://x.example.test/?'` se rechaza por la comprobación explícita de `?`/`#` sobre el texto recibido.

**`src/app/App.test.tsx`** — `render(<App envResult={...} />)`:

| # | Escenario | Verificación (consultas por rol/nombre accesible) |
| --- | --- | --- |
| 1 | `ok` con `appEnv:'local'`, `apiOrigin:null` | existe `main`; `heading` nivel 1 “TallerMecario”; se muestra “Entorno” con `local` y “API del backend” con “No configurada”; no existe `alert` |
| 2 | `ok` con `apiOrigin:'https://api.example.test'` | se muestra “Configurada”; el texto `api.example.test` **no** está en el documento |
| 3 | `ok:false` con los 2 issues posibles | existe `alert` con el heading “Configuración pública inválida” y los nombres de variable; no aparece el bloque de estado (“Entorno”) |

Ambos archivos de prueba importan el módulo bajo prueba **con el alias** (`@/app/App`, `@/shared/config/public-env`), de modo que ejercitan en ejecución el alias de Vite (los `import type` se borran y no lo ejercitan). `typecheck` ejercita `paths` de `tsconfig.app.json` y `build` ejercita el alias en `main.tsx`; así se detecta deriva entre ambos (R-07).

---

## 6. Instrucciones de implementación para DeepSeek

### 6.0 Precondiciones de arranque (verificar antes de escribir código; si fallan, **detenerse y reportar BLOQUEADO**)

Estas precondiciones condicionan *cuándo* puede empezar y validarse la implementación. **No forman parte de la aprobación técnica** de la especificación (ver cabecera) y no la modifican.

1. **Node 22 disponible en la sesión**: `node --version` debe mostrar `v22.x` con x.y ≥ `22.22.2`. La máquina del arquitecto tiene **Node 26.4.0** (R-01). No cambiar `engines`, no desactivar `engine-strict`, no usar `--force` ni `--legacy-peer-deps`, no instalar Node por cuenta propia sin autorización del usuario. Las validaciones con Node 26 **no** cuentan como evidencia de Node 22.
2. **Política de rama/worktree resuelta por el usuario** (R-02). Hasta que el usuario decida, no crear worktrees ni commits. Opciones que el usuario puede autorizar (recomendación: A):
   - **A.** El usuario (o tarea autorizada) primero versiona la base documental (`AGENTS.md`, `docs/`, cambio de `README.md`) y luego se crea un worktree fuera del repositorio en `C:\Users\leopa\.tallermecario-frontend-worktrees\s3-b01-bootstrap` (fuera de OneDrive; ver R-03) con una rama dedicada. Un worktree creado desde `main` **no contiene** esos archivos si siguen sin commit.
   - **B.** Trabajar en la raíz actual sobre una rama nueva (`git switch -c …` conserva los archivos sin commit), sin usar `git add -A`/`git add .` y sin tocar los archivos ajenos.
3. Registrar la línea base: `git status --porcelain`, y confirmar que `README.md` mide **4 158 bytes** con sha256 `210b3138a74434c3740bde42b57a7577bfcec033616b90a7e7dfa10462f66349` (si difiere, el usuario lo editó: leer el archivo y preservar su contenido actual íntegro).
4. No modificar `AGENTS.md`, `docs/**` (incluida esta especificación), ni nada fuera de la lista de la sección 4. Nunca tocar TallerMecarioB.

### 6.1 Desviaciones permitidas (únicas)

DeepSeek no puede ejecutar nada de lo especificado antes de implementarlo; los archivos normativos se derivaron de metadatos del registro, no de una ejecución. Se permite corregir **solo** lo siguiente, documentando cada cambio (archivo, motivo, salida del error) en el informe final:

- **Errores de tipografía o de lint** en el código de 5.3 (p. ej. una regla de `strictTypeChecked` que marque una construcción concreta): corregir el **código**, nunca relajar, desactivar o suprimir reglas.
- **Patrones y selectores del lint de capas (3.2):** se permite ajustar los patrones y selectores para cumplir los resultados esperados de las sondas de 7.5, sin debilitar las restricciones ni añadir dependencias. Cada ajuste debe documentarse con evidencia: archivo, motivo, patrón o selector antes y después, comando de la sonda y salida obtenida antes y después del cambio.
- **TS6306 / diseño de referencias:** si `tsc -b` rechaza los proyectos referenciados por no ser `composite`, la **única** alternativa permitida es: mantener `tsconfig.json` como solución para editor/ESLint y cambiar el script a `"typecheck": "tsc -p tsconfig.app.json && tsc -p tsconfig.node.json"`.
- **Opción de compilador rechazada por TypeScript 6.0.x** (p. ej. una opción deprecada): sustituir por la opción equivalente que TypeScript indique, sin debilitar `strict`.
- **`projectService` de typescript-eslint** que no resuelva un archivo por el layout de referencias: la única alternativa es añadir `allowDefaultProject` solo para `vite.config.ts` o apuntar `parserOptions.project` a `tsconfig.app.json` y `tsconfig.node.json`.
- **Ajuste del alias** si Vite/Vitest lo rechaza: mantener `@/` → `src/` en ambos sitios.

Todo lo demás (dependencias adicionales, reglas relajadas, estructura distinta, nuevas capas, `@ts-*`, `eslint-disable`, `--force`) requiere aprobación del arquitecto: **reportar y detenerse en esa parte**.

### 6.2 Secuencia de implementación (con punto de control por paso)

| Paso | Acción | Punto de control |
| --- | --- | --- |
| 1 | Crear `.nvmrc`, `.npmrc`, `.gitattributes`, `.editorconfig`; **añadir** el bloque a `.gitignore`. | `git status` no muestra archivos ajenos modificados por `.gitattributes` (si aparecen diffs espurios por finales de línea en archivos no tocados, **no** ejecutar `git add --renormalize`; reportar). |
| 2 | Crear `package.json` (5.2) y ejecutar `npm install` en Node 22 para generar `package-lock.json`. | Sin `ERESOLVE`/`EBADENGINE`; `npm ls --depth=0` sin entradas `invalid` ni `UNMET PEER`; `typescript` resuelto en `6.0.x`; registrar versiones resueltas. |
| 3 | Crear `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`. | Se verifica en el paso 5. |
| 4 | Crear `src/vite-env.d.ts`, `src/shared/config/public-env.ts`, `src/app/App.tsx`, `src/app/app.css`, `src/main.tsx`, `src/test/setup.ts`. | Se verifica en el paso 5. |
| 5 | Ejecutar `npm run typecheck`. | Exit 0. |
| 6 | Crear `eslint.config.js`; ejecutar `npm run lint`. | Exit 0 con `--max-warnings 0`. |
| 7 | Crear las pruebas (5.4); ejecutar `npm test`. | Exit 0; los 15 + 3 escenarios existen y pasan. |
| 8 | Ejecutar `npm run build` y luego la comprobación de humo de `dev` y `preview` (sección 7.4). | Exit 0; respuestas HTTP 200; pantalla correcta. |
| 9 | Ejecutar las sondas de límites de capas (7.5) y las comprobaciones de higiene (7.6). | Según AC-11 a AC-14. |
| 10 | Crear `.env.example` y `.github/workflows/frontend-ci.yml`; ejecutar en local `npm audit --audit-level=critical` (7.2). | AC-13, AC-19 (parte local) y AC-16 (solo presencia del archivo; el run remoto queda pendiente). |
| 11 | Anteponer la sección técnica a `README.md` (6.3). | AC-15. |
| 12 | Repetir desde cero: borrar `node_modules` y `dist`, `npm ci`, y las cuatro verificaciones. | Mismos resultados. |
| 13 | Entregar el informe de la sección 6.4. **No** commit/push/merge salvo autorización explícita de la tarea de implementación. | — |

### 6.3 README técnico (`README.md`)

Anteponer, **encima** del contenido actual, una sección en español con: título `# TallerMecario — Frontend`; propósito en una frase; requisitos (Node 22 ≥ 22.22.2 con `.nvmrc`, npm); instalación y arranque (`npm ci`, `npm run dev` → `http://localhost:5173`, `npm run dev -- --host` para probar en tablet/móvil, `npm run preview` → `http://localhost:4173`); tabla de scripts (`dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:watch`) indicando que **`build` no ejecuta typecheck**; estructura de `src/` y reglas de capas (resumen de 3.1); variables de entorno públicas (tabla con `VITE_APP_ENV` y `VITE_API_BASE_URL`, aviso “nunca secretos”, cómo usar `.env.local`); qué **no** incluye el bootstrap (lista de 2.2); enlaces a `AGENTS.md`, `docs/agents/` y a esta especificación; aviso de que la instalabilidad PWA y el modo offline **no** están implementados; nota de CI. Luego una línea `---` y **el contenido original intacto**.

No editar ninguna línea del bloque original (incluidas afirmaciones ya desactualizadas como “No contiene AGENTS.md…”; ver R-16). El contenido original debe quedar como sufijo exacto del archivo: `tail -c 4158 README.md | sha256sum` debe dar `210b3138a74434c3740bde42b57a7577bfcec033616b90a7e7dfa10462f66349`.

### 6.4 Informe de entrega de DeepSeek (obligatorio)

1. Lista de archivos creados/modificados (debe coincidir con la sección 4).
2. Versiones resueltas (`npm ls --depth=0`) y versión de Node/npm usada.
3. Cada comando de la sección 7 con su **exit code real** y las líneas relevantes de salida; los no ejecutados, con motivo. Nada se declara PASS sin ejecución.
4. Desviaciones aplicadas (6.1) con evidencia.
5. Hallazgos no resueltos y bloqueos.

---

## 7. Comandos de validación

Todos se ejecutan en la raíz del proyecto implementado, con Node 22. Son compatibles con Git Bash y PowerShell salvo indicación.

### 7.1 Entorno

```bash
node --version          # esperado: v22.x con x.y >= 22.22.2
npm --version
git status --porcelain
```

### 7.2 Instalación limpia y verificaciones (las cuatro son obligatorias y separadas)

```bash
npm ci                  # tras borrar node_modules; sin --force ni --legacy-peer-deps
npm ls --depth=0
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=critical   # escaneo de dependencias (mismo comando que el CI); exit != 0 = vulnerabilidad crítica
```

### 7.3 Dependencias: solo las aprobadas

```bash
node -e "const p=require('./package.json');console.log(Object.keys(p.dependencies).sort().join(','));console.log(Object.keys(p.devDependencies).sort().join(','))"
```
Esperado: exactamente los 2 y 14 nombres de 5.1.

### 7.4 Humo de `dev` y `preview` (portables entre shells)

```bash
# Terminal A (segundo plano)
npm run dev
# Terminal B
node -e "fetch('http://localhost:5173/').then(async r=>{const t=await r.text();console.log(r.status,t.includes('<div id=\"root\">'))})"
# Detener el servidor; después:
npm run build
npm run preview         # segundo plano
node -e "fetch('http://localhost:4173/').then(async r=>{const t=await r.text();console.log(r.status,t.includes('/assets/'))})"
```
Esperado: `200 true` en ambos. Verificación visual (navegador, si está disponible; si no, marcar *no ejecutada*): encabezado “TallerMecario”, “Entorno: local” en dev y “production” en preview, consola sin errores, sin desplazamiento horizontal a 320 px de ancho.

### 7.5 Sondas de límites de capas (temporales; se eliminan al terminar)

Procedimiento: crear los archivos de la tabla con el contenido indicado, ejecutar el lint sobre ellos en formato JSON y extraer los `ruleId`, y **eliminar todas las sondas** (incluido `src/features/`, que no debe existir al final).

```bash
npx eslint -f json src/__probe-*.ts src/shared/__probe-*.ts src/app/__probe-*.ts* src/features/__probe \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const f of JSON.parse(s))console.log(f.filePath.replace(/\\\\/g,'/').split('/src/')[1],'=>',[...new Set(f.messages.map(m=>m.ruleId))].filter(r=>r&&/^no-restricted/.test(r)).join(',')||'(sin no-restricted-*)')})"
git status --porcelain   # no deben quedar residuos de las sondas
```
Los errores de resolución de tipos de las sondas (módulos inexistentes como `@/features/otra/x`) son esperables y se ignoran: lo verificable es la presencia o ausencia de `no-restricted-imports` / `no-restricted-syntax`.

**Sondas negativas — el lint DEBE reportar la regla indicada (prueban que el límite bloquea):**

| Sonda | Archivo | Contenido | Regla esperada |
| --- | --- | --- | --- |
| P1 | `src/shared/__probe-1.ts` | `import { App } from '@/app/App'; export const p = App;` | `no-restricted-imports` |
| P2 | `src/shared/__probe-2.ts` | `import { App } from '../app/App'; export const p = App;` | `no-restricted-imports` |
| P3 | `src/shared/__probe-3.ts` | `import { x } from '@/features/a/x'; export const p = x;` | `no-restricted-imports` |
| P4 | `src/shared/__probe-4.ts` | `export const p = import('@/app/App');` | `no-restricted-syntax` |
| P5 | `src/shared/__probe-5.ts` | `import type { App } from '@/app/App'; export type P = typeof App;` | `no-restricted-imports` |
| P6 | `src/shared/__probe-6.ts` | `export * from '@/app/App';` | `no-restricted-imports` |
| P7 | `src/shared/__probe-7.ts` | `export type P = import('@/app/App').AppProps;` | `no-restricted-syntax` (`TSImportType`) |
| P8 | `src/features/__probe/m.ts` | `import { App } from '@/app/App'; export const p = App;` | `no-restricted-imports` |
| P9 | `src/features/__probe/m2.ts` | `import { x } from '@/features/otra/x'; export const p = x;` | `no-restricted-imports` |
| P10 | `src/features/__probe/m3.ts` (profundidad 0) | `import { x } from '../otra/x'; export const p = x;` | `no-restricted-imports` |
| P11 | `src/features/__probe/sub/m.ts` (profundidad 1) | `import { x } from '../../otra/x'; export const p = x;` | `no-restricted-imports` |
| P12 | `src/features/__probe/m4.ts` | `export const p = import('@/shared/config/public-env');` | `no-restricted-syntax` |
| P13 | `src/app/__probe-13.tsx` | `import { parsePublicEnv } from '../shared/config/public-env'; export const p = parsePublicEnv;` | `no-restricted-imports` |
| P14 | `src/__probe-14.ts` | `import { App } from './app/App'; export const p = App;` | `no-restricted-imports` |
| P15 | `src/shared/__probe-15.ts` | `import '@/test/setup';` | `no-restricted-imports` |
| P16 | `src/app/__probe-16.ts` | `import { render } from '@testing-library/react'; export const p = render;` | `no-restricted-imports` |
| P17 | `src/app/__probe-17.ts` | `import { expect } from 'vitest'; export const p = expect;` | `no-restricted-imports` |
| P18 | `src/app/__probe-18.ts` | `import '../test/setup';` | `no-restricted-imports` |
| P19 | `src/app/__probe-19.ts` | `export const p = (name: string) => import(name);` | `no-restricted-syntax` |
| P20 | `src/app/__probe-20.ts` | ``export const p = import.meta.glob('./*.ts');`` | `no-restricted-syntax` |
| P21 | `src/shared/__probe-21.test.ts` | `import { App } from '@/app/App'; export const p = App;` | `no-restricted-imports` (una prueba de `shared` tampoco cruza capas: los archivos de prueba no quedan exentos de los límites) |

**Sondas positivas — el lint NO debe reportar `no-restricted-*` (prueban que no hay falsos bloqueos):**

| Sonda | Archivo | Contenido | Esperado |
| --- | --- | --- | --- |
| N1 | `src/app/__probe-n1.tsx` | `import { parsePublicEnv } from '@/shared/config/public-env'; export const p = parsePublicEnv;` | sin `no-restricted-*` |
| N2 | `src/app/__probe-n2.ts` | `import { App } from './App'; export const p = App;` | sin `no-restricted-*` |
| N3 | `src/app/__probe-n3.ts` | `export const p = import('./App');` (import dinámico literal permitido en `app`) | sin `no-restricted-*` |
| N4 | `src/features/__probe/n1.ts` | `import { parsePublicEnv } from '@/shared/config/public-env'; export const p = parsePublicEnv;` | sin `no-restricted-*` |
| N5 | `src/features/__probe/sub/n2.ts` | `import { x } from '../n1'; export const p = x;` (relativa que se queda dentro de la feature) | sin `no-restricted-*` |
| N6 | `src/shared/__probe-n3.ts` | `import { parsePublicEnv } from './config/public-env'; export const p = parsePublicEnv;` | sin `no-restricted-*` |
| N7 | `src/shared/__probe-n4.test.ts` | `import { describe } from 'vitest'; import { render } from '@testing-library/react'; export const p = [describe, render];` (las pruebas sí pueden usar librerías de prueba) | sin `no-restricted-*` |
| N8 | `src/app/__probe-n5.test.tsx` | `import '@/test/setup';` (las pruebas pueden importar `src/test`) | sin `no-restricted-*` |

**Interpretación del resultado:** el resultado de las sondas es la única evidencia de que el límite funciona. Si una sonda negativa no falla o una positiva falla, es un defecto de la configuración: corregir el mecanismo (6.1) sin relajar el límite y repetir **todas** las sondas. Lo que las sondas no cubren está enumerado en 3.2 y no debe declararse cubierto.

### 7.6 Higiene, secretos y arquitectura

```bash
# Nota: los archivos nuevos aún no están versionados, por eso se usan --untracked / -co --exclude-standard.
git grep --untracked -n -E "fetch\(|XMLHttpRequest|axios|WebSocket|sendBeacon" -- src   # esperado: sin coincidencias
git grep --untracked -n -E "@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|: any\b|as any" -- src eslint.config.js vite.config.ts   # esperado: sin coincidencias
git ls-files -co --exclude-standard | grep -E "^\.env"                               # esperado: solo .env.example
git check-ignore -v .env .env.local                                                  # esperado: ambos ignorados
git check-ignore .env.example                                                        # esperado: sin salida (no ignorado)
git ls-files -co --exclude-standard src public                                       # esperado: solo los archivos de src/ listados en la sección 4; sin public/
ls dist/assets | grep -c "\.map$"                                                    # esperado: 0
tail -c 4158 README.md | sha256sum                                                   # esperado: 210b3138…66349
```
(En PowerShell, equivalentes: `git ls-files | Select-String '^\.env'`, `Get-ChildItem dist/assets -Filter *.map`, `Get-FileHash`/`Get-Content -AsByteStream`.)

### 7.7 CI

No es comprobable en local. El workflow solo se ejecuta ante `push` a `main` o `pull_request` (5.2). El primer run remoto lo origina la apertura de un PR contra `main` desde la rama de implementación (o un push a `main` si el usuario autoriza integrar directamente); ambas acciones requieren autorización explícita del usuario y **no** están concedidas por esta especificación. Cuando ocurra, registrar la **URL del run** y su **resultado real** por paso (incluidos `Dependency scan` y `Secret scan`). Sin URL y resultado, AC-16 y AC-19 (parte remota) permanecen *Pendiente*. Un fallo de `npm audit` o de gitleaks no se silencia ni se excluye: se reporta el hallazgo.

---

## 8. Criterios de aceptación

Estado de todos los criterios a la fecha de esta especificación: **Pendiente** (nada ejecutado).

| ID | Criterio verificable | Cómo verificarlo | Estado |
| --- | --- | --- | --- |
| AC-01 | Node fijado: `.nvmrc`=`22`, `engines.node`=`>=22.22.2 <23`, `.npmrc` con `engine-strict=true`, y las validaciones se ejecutaron con Node 22.x ≥ 22.22.2. | 7.1 | Pendiente (bloqueado por R-01 hasta tener Node 22) |
| AC-02 | `npm ci` desde cero finaliza con exit 0 sin `--force`/`--legacy-peer-deps`; `package-lock.json` versionable; `npm ls --depth=0` sin `invalid`/`UNMET PEER`; `typescript` en 6.0.x. | 7.2 | Pendiente |
| AC-03 | `npm run typecheck` termina con exit 0; `tsconfig.app.json` mantiene `"strict": true`. | 7.2 | Pendiente |
| AC-04 | `npm run lint` termina con exit 0 y cero warnings. | 7.2 | Pendiente |
| AC-05 | `npm test` exit 0; existen y pasan los 15 casos de `public-env.test.ts` (incluida la normalización a origen y el rechazo de rutas) y los 3 de `App.test.tsx`; sin red, sin temporizadores. | 7.2, revisión de código | Pendiente |
| AC-06 | `npm run build` exit 0 **sin** archivos `.env*` y **sin** ejecutar typecheck como parte del script; existe `dist/index.html` y `dist/assets/*.js`; sin `.map`; `dist/` no versionado. | 7.2, 7.6 | Pendiente |
| AC-07 | Independencia del backend: ningún código de `src/` realiza peticiones de red; ni scripts ni CI requieren backend, base de datos o secretos. | 7.6 | Pendiente |
| AC-08 | `npm run dev` escucha en `5173` (falla si está ocupado); `GET /` → 200 con `<div id="root">`; la pantalla muestra “TallerMecario” y “Entorno local”; consola sin errores. | 7.4 | Pendiente |
| AC-09 | Tras `build`, `npm run preview` en `4173` responde 200 y la pantalla muestra “Entorno production” (sin variables definidas). | 7.4 | Pendiente |
| AC-10 | Entorno inválido produce la pantalla de error (`role="alert"`) con nombres de variable y **sin** valores; cubierto por pruebas. | Pruebas AC-05 | Pendiente |
| AC-11 | TypeScript estricto efectivo: sin `@ts-*`, sin `eslint-disable`, sin `any` explícito en `src/`, `eslint.config.js` ni `vite.config.ts`. | 7.6 | Pendiente |
| AC-12 | Límites de capas (garantías exactas en 3.2): las 21 sondas negativas P1–P21 producen la regla indicada (`no-restricted-imports` / `no-restricted-syntax`) y las 8 positivas N1–N8 no producen ninguna `no-restricted-*`; las sondas se eliminaron y no quedan residuos (`src/features/` no existe). Lo no cubierto (3.2, limitaciones 1–9) **no** se declara cubierto. | 7.5 | Pendiente |
| AC-13 | Sin secretos: solo `.env.example` versionado entre los `.env*`; `.env` y `.env.local` ignorados; `.env.example` sin valores sensibles; `vite.config.ts` sin `envPrefix` ni `define` de `process.env`. | 7.6, revisión | Pendiente |
| AC-14 | Árbol y dependencias exactos: los archivos creados/modificados coinciden con la sección 4 (más los preexistentes sin commit); `package.json` contiene exactamente las dependencias de 5.1; no existen `src/features/`, `public/`, barrels ni carpetas vacías; `AGENTS.md` y `docs/**` sin cambios. | `git status --porcelain`, 7.3 | Pendiente |
| AC-15 | `README.md`: sección técnica presente con los apartados de 6.3 y el contenido original preservado como sufijo exacto (sha256 coincidente). | 7.6, revisión | Pendiente |
| AC-16 | Workflow `Frontend CI` presente con los pasos `npm ci` → typecheck → lint → test → build → dependency scan → secret scan, permisos `contents: read`, sin secretos, eventos `push` a `main` y `pull_request`; **y** un primer run remoto con su **URL y resultado real** por paso, originado por un evento autorizado (PR contra `main` o push a `main`, ver 5.2/7.7). | Revisión + run remoto | **Pendiente** hasta tener URL y resultado real (no verificable localmente; push/PR no autorizados aún) |
| AC-17 | Pantalla inicial accesible: `lang="es"`, meta viewport, `main` + `h1`, estado comunicado con texto (no solo color), usable a 320 px sin desplazamiento horizontal. | Pruebas + revisión visual | Pendiente |
| AC-18 | El informe de entrega de DeepSeek (6.4) incluye exit codes reales de cada comando y declara explícitamente las comprobaciones no ejecutadas. | Revisión de Codex | Pendiente |
| AC-19 | Seguridad mínima en CI: `npm audit --audit-level=critical` se ejecuta en local con resultado real (exit code registrado) y existen en el workflow el paso de dependency scan y el de secret scan (gitleaks 8.30.1 con sha256 fijado, `fetch-depth: 0`); ambos se ejecutan en el primer run remoto con su resultado. | 7.2 (local), 7.7 (remoto) | Pendiente (local y remoto) |

**Alineación con el gate transversal** (`docs/quality/frontend-relevant-gates.md` §1): este bootstrap solo puede aportar evidencia de “TypeScript sin errores”, “Lint sin errores bloqueantes” y “Unit tests del dominio afectado”. No aporta RBAC, aislamiento multitenant, E2E, idempotencia ni smoke post-deploy (no existen todavía). Un build local tampoco prueba CI remoto, instalación PWA ni integración con el backend (`quality-workflow-rules`).

---

## 9. Dependencias pendientes y riesgos concretos

### 9.1 DOC_CONFLICT

**Ninguno vigente.** Security Baseline §2/§18 (escaneo de secretos y de dependencias en CI, obligatorio) contradecía la exclusión D-20/R-09 de la revisión 1; se resolvió **incluyendo el mínimo exigido en el CI** (D-20), por lo que no se difiere ni se requiere una excepción. Observaciones (no contradicen un contrato):

- **FE-DOC-01 (resuelto por instrucción del usuario):** la Arquitectura §§22/25 propone monorepo; se aplica repositorio frontend independiente. Impacto en este bootstrap: ninguno (no se copió layout de backend).
- **README.md vs `AGENTS.md`:** el bloque original del README (sin commit) afirma que la carpeta “no contiene AGENTS.md…” y que ese archivo “deliberadamente no forma parte de esta entrega”, pero `AGENTS.md` ya existe. Es desactualización documental, sin impacto en código; **no se edita** (D-17). Impacto backend: ninguno.
- **“PWA + service worker” (ADR-005, `pwa-offline.md`) vs alcance S3-B01 (sin service worker):** decisión de alcance del usuario, no conflicto; la PWA queda como dependencia futura (D-15).

### 9.2 Contratos y decisiones futuras (no bloquean el bootstrap)

| Dependencia futura | Fuente | Qué falta | Quién |
| --- | --- | --- | --- |
| Contexto de sesión / taller / permisos | FE-DOC-09, ADR-006, `docs/architecture/authentication-and-workshop.md` | No hay endpoint de bootstrap/selector de taller/DTO de permisos; no inventar `/me`, `X-Tenant-Id`. Nombre de la variable pública de Clerk aún no definido. | Track A + especificación de auth |
| Cliente HTTP, errores, reintentos | `docs/api/conventions-and-errors.md`, `docs/api/crm.md` (no leídos aquí) | Especificación del API client: prefijo de versión y rutas (el bootstrap solo valida un **origen**, sin rutas). **Desde el frontend no se reintentan POST** (FE-DOC-04). | Track A + tarea API |
| CORS y origen de desarrollo | D-13 | El backend debe permitir `http://localhost:5173` (y el origen de staging/producción) cuando llegue el cliente API. | Track A |
| Recepción (create/update/close/cancel, checklist, daños, firma, consentimiento) | FE-DOC-07, FE-DOC-13, FE-DOC-14 | Contrato HTTP detallado y estado aprobado; no derivarlo de SQL. | Track A |
| Media / subida directa a R2 | FE-DOC-08 | Paths reales, headers PUT, TTL, allowlist, errores. | Track A |
| Sincronización offline | FE-DOC-05, FE-DOC-06, ADR-005 | Versión del protocolo (`base_version` entero vs `expectedUpdatedAt` exacto); política de bundle de privacidad. | Track A + spec offline |
| PWA (manifest, service worker, estrategia de caché, IndexedDB) | ADR-005, `pwa-offline-rules` | Plugin/estrategia no aprobados; aislamiento por identidad y tenant. Especificación propia. | Arquitecto |
| Routing y despliegue (Cloudflare Pages: `base`, fallback SPA) | `frontend-boundary.md` §4 | Sin router aprobado. | Arquitecto |
| Tokens/identidad visual | FE-DOC-16 | Sin paleta ni componentes aprobados; favicon/iconos pendientes. | Diseño |
| Endurecimiento de seguridad en CI (branch protection con checks obligatorios, pin de acciones por SHA, Dependabot/secret scanning nativo de GitHub, SBOM) | Security Baseline §2 (“PR bloqueado si el escáner detecta…”), §18; Gate S14 | El mínimo (escaneo de secretos + `npm audit`) **ya está en el CI del bootstrap**; queda el bloqueo efectivo del PR (ajuste de repositorio, decisión del usuario) y el resto del hardening. | Usuario / arquitecto |

### 9.3 Riesgos y bloqueos concretos

| ID | Riesgo / bloqueo | Evidencia | Mitigación / acción |
| --- | --- | --- | --- |
| **R-01 (bloqueo de validación)** | La máquina tiene **Node 26.4.0**, sin gestor de versiones detectado. Con `engine-strict`, `npm ci` fallará fuera de Node 22 (comportamiento deseado). Validar con Node 26 no prueba compatibilidad con Node 22. | `node --version` → v26.4.0; `which nvm fnm volta` sin resultado. | El usuario debe proporcionar Node 22.x (≥22.22.2; última 22.23.3) antes de implementar/validar. No se instaló nada. La autoridad de compatibilidad es el run de CI en Node 22. |
| **R-02 (decisión del usuario)** | `AGENTS.md`, `docs/` y el cambio de `README.md` **no están versionados**. Un worktree creado desde `main` no los contiene. No se hizo commit (instrucción de la tarea). | `git status`: `M README.md`, `?? AGENTS.md`, `?? docs/`. | El usuario elige política A o B (6.0). Bloquea el arranque de la implementación, no esta especificación. |
| R-03 | El repositorio está dentro de OneDrive: `node_modules` (miles de archivos, enlaces en `.bin`) puede provocar sincronización lenta, bloqueos de archivos y problemas de ruta. | Ruta `...\OneDrive\Documentos\Proyectos\TallerMecario`. | Preferir el worktree fuera de OneDrive de `git-worktree-rules` (`C:\Users\leopa\.tallermecario-frontend-worktrees\…`) o excluir `node_modules` de la sincronización. |
| R-04 | Versiones mayores muy recientes (Vite 8, Vitest 5, ESLint 10, TypeScript 6, jsdom 30, plugin-react 6): compatibilidad verificada **solo por metadatos** `engines`/`peerDependencies`; los archivos de configuración de esta especificación **no se han ejecutado**. Posibles diferencias de opciones (p. ej. TypeScript 6 deprecando opciones, layout de referencias, `projectService`). | Sección 1.4; ninguna instalación realizada. | Desviaciones acotadas en 6.1; el informe debe adjuntar errores reales. Ningún PASS sin ejecución. |
| R-05 | `typescript@latest` es 7.0.2 y **rompe el peer** de typescript-eslint 8.71.0 (`<6.1.0`). Un `npm install typescript` sin rango o una actualización automática lo instalaría. | `npm view typescript-eslint@8.71.0 peerDependencies`. | Rango `~6.0.3`; rechazar PRs/bots que suban TS a 7 hasta que typescript-eslint lo soporte. |
| R-06 | Node 22 entra en fin de vida el **2027-04-30** (mantenimiento desde 2025-10-21); ya existe LTS Node 24. `AGENTS.md` fija Node 22 como baseline. | `nodejs/Release/schedule.json`. | Planificar una tarea de migración del baseline antes de esa fecha; `.nvmrc`/`engines`/CI son el único punto de cambio. |
| R-07 | El alias `@/` vive en dos sitios (`tsconfig.app.json` y `vite.config.ts`): riesgo de deriva. | D-10. | Las pruebas y `typecheck` + `build` lo ejercen; revisar ambos al tocar alias. |
| R-08 | CI no validado remotamente (AC-16 pendiente); acciones fijadas por tag mayor (`@v7`), no por SHA; sin reglas de protección de rama. | AC-16. | Pin por SHA y branch protection: endurecimiento posterior (Gate S14). El primer run lo origina un PR/push autorizado por el usuario (5.2). |
| R-09 | **Resuelto en esta revisión (D-20):** el mínimo de Security Baseline §2/§18 está en el CI. Riesgos residuales: (a) un workflow por sí solo no “bloquea el PR”: hace falta marcar el check como obligatorio en la protección de rama (**decisión pendiente del usuario**); (b) `npm audit` puede fallar por avisos nuevos ajenos al cambio y gitleaks por falsos positivos en `docs/` (45+ archivos de texto con ejemplos); (c) gitleaks y `gitleaks git` están verificados solo por release/checksum, **no ejecutados**; (d) si el repositorio pasa a una organización, `gitleaks-action` exigiría licencia (no se usa la acción, sino el binario). | `docs/security/frontend-security.md` §2 y §18; release v8.30.1. | Reportar hallazgos, no silenciarlos; cualquier allowlist (`.gitleaks.toml`) requiere aprobación del arquitecto. |
| R-10 | Reglas de `react-hooks` registradas manualmente (no el preset) y typed linting con `projectService` sobre layout de referencias: sin ejecutar, podrían requerir ajuste. | D-06, 6.1. | Desviaciones acotadas en 6.1. |
| R-11 | `tsc -b` con proyectos no `composite` podría ser rechazado (TS6306). | 6.1. | Alternativa única definida en 6.1. |
| R-12 | La PWA no está iniciada: no hay manifest ni service worker; no se puede afirmar instalabilidad ni offline. | D-15. | Especificación PWA separada tras aprobar plugin/estrategia. |
| R-13 | Sin router ni despliegue definido: rutas profundas y `base` de Cloudflare Pages sin decidir. | D-03. | Decidir con la primera feature. |
| R-14 | Origen de desarrollo fijo `5173`/`4173` (`strictPort`): un puerto ocupado detiene el servidor en lugar de cambiarlo. | D-13. | Comportamiento deseado; liberar el puerto. |
| R-15 | Sin tokens de diseño: la pantalla usa colores del sistema; no hay identidad visual ni favicon. | FE-DOC-16. | Tarea de diseño posterior. |
| R-16 | Afirmaciones desactualizadas en el bloque original del README sin commit. | 9.1. | Conservadas; corregir en una tarea autorizada por el usuario. |
| R-17 | El lint de capas no cubre todo: imports dinámicos literales dentro de `app`, cadenas de `vi.mock`, ciclos, efectos al importar, relativas entre features en archivos con ≥4 subcarpetas (bloqueo conservador) y el bloque `features` sin código real (limitaciones 1–9 de 3.2). | 3.2. | Revisión de Codex; repetir las sondas al crear la primera feature; reevaluar plugin de límites/ciclos (aprobación aparte) cuando haya una segunda feature. |
| R-18 | `core.autocrlf=true` local + `.gitattributes eol=lf`: riesgo de diffs espurios de finales de línea al añadir `.gitattributes`. | 1.1. | Punto de control del paso 1 (6.2): no renormalizar; reportar. |

### 9.4 Precondiciones de arranque y decisiones realmente pendientes

**Precondiciones de arranque** (condicionan cuándo se implementa/valida; **no** afectan la aprobación técnica de la especificación):

1. **R-01**: no hay Node 22 en la máquina → la implementación y validación (AC-01…AC-09) no pueden ejecutarse hasta disponer de él.
2. **R-02**: política de rama/worktree y versionado de la base documental (opciones A/B de 6.0) sin definir por el usuario.

**Decisiones que siguen pendientes del usuario** (no se suponen resueltas):

1. **Autorizar push y/o PR** para originar el primer run remoto (AC-16, AC-19 remoto). Sin esa autorización no hay URL de run.
2. **Marcar el job `Frontend CI` como check obligatorio** en la protección de rama de `main`: sin ello el Security Baseline §2 (“PR bloqueado si el escáner detecta credenciales”) no se cumple del todo, aunque el escaneo exista (R-09).
3. **Política de rama/versionado** de la base documental (R-02) y, en su caso, autorización de commits para DeepSeek.

Ninguna impide considerar completa **esta especificación**; las precondiciones bloquean el arranque de la implementación y las decisiones 1–2 bloquean la evidencia remota y el cierre de la protección de seguridad.
