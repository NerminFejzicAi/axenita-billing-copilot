import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'docs/**',
      'services/tariff-engine-java/**',
      // Prisma generated client (02 §26). Regenerated, never hand-edited.
      'apps/api/src/generated/**',
    ],
  },

  js.configs.recommended,

  // Plain JavaScript tooling files (workspace scripts, flat config itself).
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // TypeScript sources — type-aware linting.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      // 12 §4 — no `any`, no unchecked non-null assertions.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 09 §11 / 12 §13 — logging goes through the framework logger, never console.
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Read configuration through the validated ConfigService instead of process.env (04 §3.3, 00 §8.4).',
        },
      ],
    },
  },

  // Test sources may reach for process.env to build isolated environments.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // CLI tooling configuration executed outside the Nest runtime (Prisma, Vitest). These
  // files exist precisely to read the raw environment before any application container is
  // built, so the ConfigService restriction cannot apply to them (00 §8.4 governs runtime).
  {
    files: ['**/prisma.config.ts', '**/vitest.*.config.ts', '**/vitest.config.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  prettierConfig,
);
