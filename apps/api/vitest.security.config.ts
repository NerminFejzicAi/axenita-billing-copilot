import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Phase 3 security test configuration (08 §2.2, §21.5, §21.6, §21.7 — `*.security.ts`).
 *
 * These specs are the executable form of the D-047, D-048, D-049 and D-051 test contracts.
 * They need a real PostgreSQL and they MUTATE it: they seed, they open and abort maintenance
 * windows, and they revoke and restore a grant. They therefore run against a database this
 * suite creates and drops itself — never the development database `copilot`, and never the
 * shared integration database `copilot_test` (08 §3).
 *
 * The global setup refuses to start unless the target host is localhost or 127.0.0.1 and the
 * database name announces itself as disposable.
 *
 * They are a separate suite rather than more `*.integration.ts` files because the integration
 * suite asserts a stable, shared, already-migrated database, which is the opposite of what
 * these specs need.
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
    include: ['test/**/*.security.ts'],
    globalSetup: ['./test/setup/security-global-setup.ts'],
    // One disposable database, shared by every spec: serialise so that the catalogue
    // assertions and the maintenance-window specs cannot interleave.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
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
