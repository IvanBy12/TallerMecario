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

/**
 * Aislamiento de Clerk (D-A04, AC-A04): `@clerk/*` solo se importa desde
 * `src/features/auth/clerk-session.tsx`. El resto del código depende de `AuthSessionPort`.
 */
const CLERK_PATTERNS = [
  {
    group: ['@clerk', '@clerk/**'],
    message: 'Solo src/features/auth/clerk-session.tsx puede importar @clerk/*.',
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
        'no-restricted-imports': [
          'error',
          { patterns: [...CLERK_PATTERNS, ...patterns, ...TEST_INFRA_PATTERNS] },
        ],
      },
    },
    {
      files: files.map((file) => file.replace('*.{ts,tsx}', '*.test.{ts,tsx}')),
      rules: { 'no-restricted-imports': ['error', { patterns: [...CLERK_PATTERNS, ...patterns] }] },
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

const FEATURE_PATTERNS = [
  { group: ['**/app', '**/app/**'], message: 'Una feature no puede depender de app.' },
  { group: ['@/features', '@/features/**'], message: 'Una feature no importa otras features.' },
];
const FEATURE_RELATIVE_MESSAGE =
  'Una feature no importa fuera de su propia carpeta con rutas relativas.';

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
    files: ['vite.config.ts', 'playwright.config.ts'],
    rules: { 'no-restricted-exports': 'off' },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
  },
  // --- Límites de capas (garantías y limitaciones: sección 3.2 de S3-B01) ---
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
  ...subtreeImportRules('src/features/*', FEATURE_PATTERNS, FEATURE_RELATIVE_MESSAGE),
  // Excepción de aislamiento de Clerk: el módulo de sesión conserva TODAS las demás restricciones
  // (no accede a app, a otras features, a infraestructura de pruebas ni sale de su carpeta).
  {
    files: ['src/features/auth/clerk-session.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...FEATURE_PATTERNS,
            escapeRelative(0, FEATURE_RELATIVE_MESSAGE),
            ...TEST_INFRA_PATTERNS,
          ],
        },
      ],
    },
  },
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
