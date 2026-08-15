import type { TestProject } from 'vitest/node';

import { runPhase3Seed } from '../../prisma/seed.js';
import {
  createDisposableDatabase,
  dropDisposableDatabase,
  generateDisposableDatabaseName,
  type DisposableDatabase,
} from '../support/disposable-database.js';
import { runPrismaCli } from '../support/run-prisma-cli.js';

/**
 * Builds the world the phase 3 security suite asserts against, and takes it down again.
 *
 * The sequence is exactly the canonical one of 02 §26.3 step 5 — a fresh, correctly
 * bootstrapped, empty database, then the full migration chain through `migrate deploy`, then
 * the §23.2 seed. Nothing is applied out of band, so a defect in the real deployment path
 * fails this suite rather than hiding behind test-only setup SQL.
 *
 * The database name is published through Vitest's provide/inject channel, so every spec
 * targets the same disposable database and no spec can invent its own target.
 */
declare module 'vitest' {
  export interface ProvidedContext {
    disposableDatabaseName: string;
  }
}

let disposable: DisposableDatabase | undefined;

export async function setup(project: TestProject): Promise<void> {
  disposable = await createDisposableDatabase(generateDisposableDatabaseName());

  runPrismaCli(['migrate', 'deploy'], disposable.migration);
  await runPhase3Seed(disposable.migration);

  project.provide('disposableDatabaseName', disposable.name);
}

export async function teardown(): Promise<void> {
  if (disposable === undefined) {
    return;
  }

  await dropDisposableDatabase(disposable);
  disposable = undefined;
}
