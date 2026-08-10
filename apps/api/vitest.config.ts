import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit test configuration (08 §4 — `*.spec.ts` are unit tests and never touch a real
 * database, queue or object storage).
 *
 * SWC handles the transform because NestJS dependency injection relies on
 * `emitDecoratorMetadata`, which esbuild does not implement (D-021 consequence).
 */
export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace contract package from source so unit tests do not require a
      // prior build step.
      '@axenita/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup/test-environment.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
