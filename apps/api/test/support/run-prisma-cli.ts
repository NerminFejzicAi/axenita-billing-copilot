import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/**
 * Runs the Prisma CLI from a test.
 *
 * The CLI entry point is resolved and executed with the current Node binary rather than
 * through a shell. Spawning with `shell: true` would concatenate arguments unescaped
 * (Node DEP0190), and there is no reason to involve a shell here.
 *
 * `MIGRATION_DATABASE_URL` is supplied by the caller so the CLI always runs as
 * `copilot_migrator` against the isolated test database (02 §3.4, 08 §3).
 */
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const apiRoot = resolve(import.meta.dirname, '../..');

export function runPrismaCli(args: readonly string[], migrationDatabaseUrl: string): string {
  return execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: apiRoot,
    env: { ...process.env, MIGRATION_DATABASE_URL: migrationDatabaseUrl },
    encoding: 'utf8',
  });
}
