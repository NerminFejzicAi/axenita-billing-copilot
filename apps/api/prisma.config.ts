import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (D-004, Prisma 7).
 *
 * The single most important property of this file: the CLI is bound to
 * `MIGRATION_DATABASE_URL`, the `copilot_migrator` credential (02 §3.1, §3.4). The runtime
 * application never reads that variable — it is deliberately absent from the runtime
 * environment schema, and `PrismaService` builds its client from `DATABASE_URL` instead
 * (02 §3.4, D-023 clause 6, AGENTS.md §5.2).
 *
 * `.env` loading is explicit. Prisma 7 no longer loads it implicitly, and Node's built-in
 * `process.loadEnvFile` avoids adding a dependency for something the runtime already
 * solves (00 §5.3). Values already present in the process environment win, so CI and
 * deployment pipelines are never overridden by a stray local file.
 */
function loadEnvironmentFile(relativePath: string): void {
  const absolutePath = resolve(import.meta.dirname, relativePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const before = { ...process.env };
  process.loadEnvFile(absolutePath);

  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

if (process.env['MIGRATION_DATABASE_URL'] === undefined) {
  loadEnvironmentFile('.env');
  loadEnvironmentFile('../../.env');
}

const migrationDatabaseUrl = process.env['MIGRATION_DATABASE_URL'];

if (migrationDatabaseUrl === undefined || migrationDatabaseUrl.length === 0) {
  // Fail loudly rather than silently falling back to a runtime credential. The message
  // names the variable and never its value (09 §9, §11).
  throw new Error(
    'MIGRATION_DATABASE_URL is not set. The Prisma CLI must run as copilot_migrator (02 §3.4).',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationDatabaseUrl,
  },
});
