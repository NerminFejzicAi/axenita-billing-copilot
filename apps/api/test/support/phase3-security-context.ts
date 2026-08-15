import { Client } from 'pg';
import { inject } from 'vitest';

import { disposableDatabaseUrls, type DisposableDatabase } from './disposable-database.js';

/**
 * Shared plumbing for the phase 3 security specs.
 *
 * Every spec resolves the SAME disposable database, created by the suite's global setup, and
 * every spec talks to it through one of the three canonical identities of 02 §3.4. Nothing
 * here opens a fourth credential and nothing here is a superuser.
 */

/** SQLSTATE `insufficient_privilege` — the expected outcome of every negative privilege test. */
export const INSUFFICIENT_PRIVILEGE = '42501';

/** SQLSTATE `object_not_in_prerequisite_state` — raised by the D-048 window assertions. */
export const OBJECT_NOT_IN_PREREQUISITE_STATE = '55000';

/** The disposable database created for this suite run. */
export function securityDatabase(): DisposableDatabase {
  return disposableDatabaseUrls(inject('disposableDatabaseName'));
}

export async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/**
 * Runs a statement inside a transaction that is always rolled back, and returns the SQLSTATE
 * PostgreSQL reported — or `undefined` when the statement succeeded.
 *
 * Same shape as the phase 2 privilege suite, deliberately: a negative privilege test asserts
 * the exact SQLSTATE, never merely "it threw".
 */
export async function sqlStateOf(client: Client, statement: string): Promise<string | undefined> {
  try {
    await client.query('begin');
    await client.query(statement);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  } finally {
    await client.query('rollback');
  }
}

/**
 * Runs `work` inside one transaction with the `app.*` context of a request, then rolls back.
 *
 * `app.user_id` is established through `app_security.set_user_context` — the accepted phase 3
 * function — while `app.practice_id` is set with `set_config` directly. `set_request_context`
 * belongs to phase 4 and is deliberately not implemented here (02 §16.2.3, §22.13); 02 §25.1.1
 * permits a test to set the GUC directly for policy verification.
 */
export async function withAppContext<T>(
  client: Client,
  context: { authSubject?: string; userId?: string; practiceId?: string },
  work: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query('begin');

  try {
    if (context.authSubject !== undefined) {
      await client.query('select app_security.set_auth_subject_context($1)', [context.authSubject]);
    }

    if (context.userId !== undefined) {
      await client.query('select app_security.set_user_context($1::uuid)', [context.userId]);
    }

    if (context.practiceId !== undefined) {
      await client.query('select set_config($1, $2, true)', [
        'app.practice_id',
        context.practiceId,
      ]);
    }

    return await work(client);
  } finally {
    await client.query('rollback');
  }
}
