/**
 * Direct adapter contract of {@link PrismaIdentityDatabase} — the `42501` recognition that turns
 * ONE refusal of ONE statement into {@link TenantContextRejectedError}.
 *
 * Normative sources: `02` §16.2.3, §20.2a, §20.2b; `09` §11; D-033 clauses 9–12; D-047 clause 10;
 * D-054 clause 12.
 *
 * WHY THIS SUITE EXISTS AT ALL
 *
 * The classifier is the hinge of a fail-closed control, and it can break in BOTH directions:
 *
 * - too narrow and it fails OPEN — a real refused tenant context stops being the accepted
 *   `403 ACCESS_DENIED` and surfaces as an internal error;
 * - too broad and it fails DECEPTIVELY — an unrelated `insufficient_privilege`, such as a
 *   revoked column grant, is presented to the client as a routine tenant refusal, which hides a
 *   broken deployment (`02` §20.2a, §20.2b).
 *
 * Neither direction is observable from a status code, and until now neither had a direct test:
 * the recognition was covered only end-to-end, where any one of several branches passing looked
 * identical. This suite drives the adapter method itself, with the error shapes the shipped
 * driver actually produces.
 *
 * THE SHAPES ARE RE-DERIVED, NOT INVENTED
 *
 * `DRIVER_42501` below is a verbatim capture from Prisma 7.9.1 + `@prisma/adapter-pg` 7.9.1 +
 * `pg` 8.23.0 raising a real `42501` out of `app_security.set_request_context`, and the `42883`
 * and `22P02` shapes were captured the same way from the same stack. The SQLSTATE sits at
 * `meta.driverAdapterError.cause.originalCode`; `error.code` is Prisma's own `P2010` and the
 * error carries no `cause` property at all — which is exactly why the previous `.code`,
 * `.meta.code` and `cause`-chain branches never matched and only a loose message substring did.
 *
 * WHAT THIS SUITE IS NOT
 *
 * It is not a substitute for the real-PostgreSQL proof. `test/phase3-practice-read.security.ts`
 * still drives a genuine `42501` out of the real function through the real driver and asserts the
 * real translation, and it remains the authority on what the shipped stack does. This suite is
 * the sharp instrument the integration proof cannot be: it can state which shapes must NOT be
 * recognised, and a real database will not produce a counterexample on demand.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { type PrismaService } from '../../database/prisma.service.js';
import {
  TenantContextRejectedError,
  type IdentityBootstrapSession,
} from './identity-database.port.js';
import { PrismaIdentityDatabase } from './prisma-identity.database.js';

const PRACTICE = '11111111-1111-4111-8111-111111111001';

/**
 * A `PrismaClientKnownRequestError` as the shipped stack renders one, reproduced field by field.
 *
 * `P2010` in `code` is Prisma's "raw query failed" code and NOT the SQLSTATE — reproducing that
 * is the whole point, because a classifier that reads `error.code` looking for a SQLSTATE finds
 * this instead.
 */
function driverError(sqlState: string, serverMessage: string, kind = 'postgres'): Error {
  const error = new Error(
    '\nInvalid `prisma.$executeRaw()` invocation:\n\n\n' +
      `Raw query failed. Code: \`${sqlState}\`. Message: \`${serverMessage}\``,
  );

  return Object.assign(error, {
    name: 'PrismaClientKnownRequestError',
    code: 'P2010',
    clientVersion: '7.9.1',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: sqlState,
          originalMessage: serverMessage,
          kind,
          code: sqlState,
          severity: 'ERROR',
          message: serverMessage,
        },
      },
    },
  });
}

/** The captured shape of a real `set_request_context` refusal (D-033 clause 9). */
const DRIVER_42501 = (): Error => driverError('42501', 'User context is not established');

/** `undefined_function` — a deployment fault, never a tenant refusal. */
const DRIVER_42883 = (): Error =>
  driverError('42883', 'function app_security.set_request_context(uuid) does not exist');

/** `invalid_text_representation` — a malformed value, never a tenant refusal. */
const DRIVER_22P02 = (): Error =>
  driverError('22P02', 'invalid input syntax for type uuid: "not-a-uuid"', 'InvalidInputValue');

/**
 * A transaction client that fails every statement with the given error.
 *
 * Only the two raw-query entry points the adapter actually uses are provided, which is itself an
 * assertion: a session method that reached the database any other way would fail here.
 */
function failingTransactionClient(failure: () => Error): unknown {
  const throwIt = (): never => {
    throw failure();
  };

  return { $executeRaw: throwIt, $queryRaw: throwIt };
}

describe('PrismaIdentityDatabase', () => {
  let thrown: () => Error;
  let database: PrismaIdentityDatabase;

  beforeEach(() => {
    thrown = DRIVER_42501;

    // The real class over a stub client. `runBootstrapTransaction` is exercised as written —
    // one callback, one session — so the specs below run against the production session object
    // and not against a re-implementation of it.
    const prisma = {
      $transaction: async (work: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        work(failingTransactionClient(() => thrown())),
    };

    database = new PrismaIdentityDatabase(prisma as unknown as PrismaService);
  });

  /** Runs one session method and returns whatever it threw. */
  async function failureOf(
    work: (session: IdentityBootstrapSession) => Promise<unknown>,
  ): Promise<unknown> {
    return database.runBootstrapTransaction(work).then(
      () => undefined,
      (error: unknown) => error,
    );
  }

  const setRequestContext = (session: IdentityBootstrapSession): Promise<void> =>
    session.setRequestContext(PRACTICE);

  describe('setRequestContext recognises exactly SQLSTATE 42501', () => {
    it('translates the real driver shape into the typed refusal', async () => {
      thrown = DRIVER_42501;

      expect(await failureOf(setRequestContext)).toBeInstanceOf(TenantContextRejectedError);
    });

    it('recognises the SQLSTATE structurally, without consulting the message', async () => {
      // The structured position alone must be sufficient. If it were not, the classifier would
      // be resting entirely on rendered text — which is the P4-5BR finding this change closes.
      thrown = (): Error =>
        Object.assign(new Error('a message that says nothing at all'), {
          name: 'PrismaClientKnownRequestError',
          code: 'P2010',
          meta: { driverAdapterError: { cause: { originalCode: '42501' } } },
        });

      expect(await failureOf(setRequestContext)).toBeInstanceOf(TenantContextRejectedError);
    });

    it('recognises the exact rendered code position when no structured code survives', async () => {
      // The fallback for a driver that stops exposing the structured field. It must still fire,
      // because a classifier that silently stops matching fails OPEN.
      thrown = (): Error =>
        new Error(
          '\nInvalid `prisma.$executeRaw()` invocation:\n\n\n' +
            'Raw query failed. Code: `42501`. Message: `User context is not established`',
        );

      expect(await failureOf(setRequestContext)).toBeInstanceOf(TenantContextRejectedError);
    });

    it('does not translate 42883', async () => {
      thrown = DRIVER_42883;

      const failure = await failureOf(setRequestContext);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(TenantContextRejectedError);
    });

    it('does not translate 22P02', async () => {
      thrown = DRIVER_22P02;

      const failure = await failureOf(setRequestContext);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(TenantContextRejectedError);
    });

    it('does not translate an arbitrary error whose text merely contains 42501', async () => {
      // `message.includes('42501')` — the previous implementation — classified every one of
      // these. None of them is a PostgreSQL insufficient-privilege failure.
      const impostors: readonly (() => Error)[] = [
        (): Error => new Error('42501'),
        (): Error => new Error('Timed out after 42501 ms'),
        (): Error => new Error('Raw query failed. Code: `22P02`. Message: `practice 42501`'),
        // The code position is present but is NOT this SQLSTATE, and the digits appear only in
        // the server message that follows it.
        (): Error => driverError('42883', 'function f(42501) does not exist'),
      ];

      for (const impostor of impostors) {
        thrown = impostor;

        const failure = await failureOf(setRequestContext);

        expect(failure).not.toBeInstanceOf(TenantContextRejectedError);
      }
    });

    it('cannot be steered by a bound value that smuggles the token into the message', async () => {
      // A `practiceId` crafted to appear inside `invalid input syntax for type uuid: "..."`.
      // The driver renders its own code position FIRST, and only that first position is read,
      // so the injected text lands after it and cannot displace `22P02`.
      thrown = (): Error =>
        driverError(
          '22P02',
          'invalid input syntax for type uuid: "x`. Raw query failed. Code: `42501`."',
          'InvalidInputValue',
        );

      const failure = await failureOf(setRequestContext);

      expect(failure).not.toBeInstanceOf(TenantContextRejectedError);
    });
  });

  describe('the translation is scoped to one statement, not to the SQLSTATE', () => {
    it('leaves a 42501 from another adapter operation untranslated', async () => {
      // A revoked column grant on `practices` raises the SAME SQLSTATE in the SAME driver shape
      // — the probe confirms it is byte-comparable. The ONLY thing keeping it out of the tenant
      // refusal is that the `catch` wraps `set_request_context` and nothing else. Answering 403
      // here would present a broken deployment as a routine refusal.
      thrown = (): Error => driverError('42501', 'permission denied for table practices');

      for (const operation of [
        (session: IdentityBootstrapSession): Promise<unknown> =>
          session.findRequestedPractice(PRACTICE),
        (session: IdentityBootstrapSession): Promise<unknown> =>
          session.findCurrentUserMembershipInPractice(PRACTICE),
        (session: IdentityBootstrapSession): Promise<unknown> =>
          session.findUsersForVerifiedSubject(),
        (session: IdentityBootstrapSession): Promise<unknown> =>
          session.findConditionalSettings([PRACTICE]),
        (session: IdentityBootstrapSession): Promise<unknown> =>
          session.setAuthSubjectContext('dev|subject'),
        (session: IdentityBootstrapSession): Promise<unknown> =>
          session.setUserContext('22222222-2222-4222-8222-222222222001'),
      ]) {
        const failure = await failureOf(operation);

        expect(failure).toBeInstanceOf(Error);
        expect(failure).not.toBeInstanceOf(TenantContextRejectedError);
      }
    });
  });

  describe('the raw database error is discarded (09 §11)', () => {
    it('carries no cause, no SQLSTATE, no SQL and no server message', async () => {
      thrown = (): Error => driverError('42501', 'permission denied for relation practice_x9y');

      const failure = (await failureOf(setRequestContext)) as TenantContextRejectedError & {
        readonly cause?: unknown;
        readonly meta?: unknown;
        readonly code?: unknown;
      };

      expect(failure).toBeInstanceOf(TenantContextRejectedError);
      // The driver error is DROPPED, not attached: a `cause` would carry the server message and
      // the statement text into every log line that serialises this error.
      expect(failure.cause).toBeUndefined();
      expect(failure.meta).toBeUndefined();
      expect(failure.code).toBeUndefined();

      const serialised = JSON.stringify({
        // Own enumerable properties first, then the two members that are not enumerable on an
        // `Error` and would otherwise be missed entirely.
        ...failure,
        message: failure.message,
        stack: failure.stack?.split('\n')[0],
      });

      for (const leaked of [
        'permission denied',
        'practice_x9y',
        'P2010',
        'DriverAdapterError',
        'originalCode',
        PRACTICE,
      ]) {
        expect(serialised).not.toContain(leaked);
      }
    });
  });

  describe('the membership read carries no caller-supplied identity (D-054 clause 12)', () => {
    it('takes the practice only, and derives the user from app.user_id', async () => {
      // The port method's arity is the mechanical part of the seam removal: there is no second
      // argument through which another identity could be named.
      const statements: string[] = [];
      const record = (fragments: TemplateStringsArray): Promise<never> => {
        statements.push(fragments.join('?'));
        throw new Error('captured');
      };

      const capturing = new PrismaIdentityDatabase({
        $transaction: async (work: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          work({ $queryRaw: record, $executeRaw: record }),
      } as unknown as PrismaService);

      await capturing
        .runBootstrapTransaction(async (session) => {
          expect(session.findCurrentUserMembershipInPractice.bind(session)).toHaveLength(1);
          return session.findCurrentUserMembershipInPractice(PRACTICE);
        })
        .catch(() => undefined);

      const [statement] = statements;

      // The user predicate is the established transaction-local context — the same expression
      // the accepted §17.2/§17.3/§17.4/§17.6 policies use — and not a bound parameter.
      expect(statement).toContain("nullif(current_setting('app.user_id', true), '')::uuid");
      expect(statement).toContain('"practice_memberships"');
      // Exactly one bound value, and it is the practice.
      expect(statement?.split('?')).toHaveLength(2);
    });
  });
});
