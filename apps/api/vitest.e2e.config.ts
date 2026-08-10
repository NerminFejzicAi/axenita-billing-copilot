import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * API end-to-end configuration (08 §4 — `*.e2e-spec.ts`).
 *
 * These specs boot the real Nest application through the shared `configureApplication`
 * bootstrap, so the global prefix, versioning, Helmet, CORS allowlist, validation pipe and
 * Problem Details filter under test are the ones that run in production.
 *
 * They use only in-process stub listeners for dependency probes, so the suite stays
 * runnable without Docker. Real container health is a separate phase 1 gate (04 §3.6).
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
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup/test-environment.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
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
