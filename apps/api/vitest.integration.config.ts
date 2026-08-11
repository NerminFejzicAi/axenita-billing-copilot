import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration test configuration (08 §2.2, §4 — `*.integration.ts`).
 *
 * These specs use a **real PostgreSQL**: the isolated `copilot_test` instance on the compose
 * `test` profile (08 §3). They prove what a mocked suite cannot — role attributes, grants,
 * ownership, migration behaviour and a genuine database round trip through Prisma.
 *
 * They require Docker. The unit and end-to-end suites deliberately do not.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@axenita/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.integration.ts'],
    globalSetup: ['./test/setup/integration-global-setup.ts'],
    setupFiles: ['./test/setup/integration-environment.ts'],
    // One database, shared state: serialise so that migration state assertions are stable.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
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
