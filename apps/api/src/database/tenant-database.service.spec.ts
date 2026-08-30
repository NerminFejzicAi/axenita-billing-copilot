/**
 * The concrete `TenantDatabaseService` facade — the RE-PROOF of D-054 clauses 6–10, required as
 * a condition of acceptance by D-056 clause 5 point 6 and by `08` §12.10 point 3.
 *
 * D-054 clause C.2 is not a style guide: it is the list of properties without which the facade
 * would be the parallel database stack the decision refuses. Each clause is asserted here
 * separately and by its number, so a future change that quietly acquires one of the forbidden
 * capabilities fails against the clause it violates rather than against a vague expectation.
 *
 *     clause 6   uses the EXISTING pinned transaction/session of the authenticated request
 *     clause 7   owns no `PrismaClient` — one `PrismaService`, one `copilot_app` client
 *     clause 8   opens no second, nested or parallel application transaction
 *     clause 9   does not set `app.practice_id` before the canonical `practices.status` and
 *                ACTIVE-membership checks — it does not set it at all
 *     clause 10  never treats a caller-supplied `userId` as a trust boundary; there is no
 *                identity parameter anywhere on it
 *
 * The ordering half of the story — that the feature statement really runs after
 * `set_request_context`, on that same session, inside that one transaction — is the BEHAVIOURAL
 * proof and lives in `patient-reference-read.service.spec.ts` against the recording session.
 * This suite is about the facade's own shape and capabilities.
 */

import { describe, expect, it } from 'vitest';

import { RecordingDatabase, emptyWorld } from '../../test/support/recording-identity-database.js';
import { type AdmittedTenantRequest } from '../identity/application/tenant-request.pipeline.js';
import { type IdentityBootstrapSession } from '../identity/infrastructure/identity-database.port.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { type TenantStatement } from './tenant-statement.js';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const OTHER_PRACTICE = '11111111-1111-4111-8111-111111111002';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';

/** An admitted request exactly as `TenantRequestPipeline.admit` returns one: frozen and narrow. */
function admittedRequest(practiceId: string = PRACTICE): AdmittedTenantRequest {
  return Object.freeze({
    practiceId,
    membershipId: MEMBERSHIP,
    permissions: ['patient_reference.read'] as const,
  });
}

/**
 * The EXECUTABLE CODE of a method, with comments removed.
 *
 * The assertions below are about what the facade DOES, and this file — like every file in this
 * repository — documents at length what it deliberately does not do. Asserting over the raw
 * `toString()` would therefore fail on the very prose that explains the property, so the prose
 * is stripped first and only the code is searched.
 */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** A statement a feature adapter would build. The SQL is irrelevant to this suite. */
function statement(label = 'select patient_reference'): TenantStatement {
  return {
    label,
    // `Prisma.Sql` is structural here on purpose: this suite must not import the client.
    sql: { strings: ['select 1'], values: [] } as unknown as TenantStatement['sql'],
  };
}

describe('TenantDatabaseService (D-054 clauses 6-10, D-056 clause 5)', () => {
  const facade = new TenantDatabaseService();

  describe('clause 7 — it owns no PrismaClient and no PrismaService', () => {
    it('has no constructor dependencies at all', () => {
      // The strongest available form of "owns no client": there is nothing to inject one
      // through. A facade that took a `PrismaService` could open its own transaction whatever
      // its methods currently do.
      expect(TenantDatabaseService.length).toBe(0);
      expect(Object.keys(facade)).toEqual([]);
    });

    it('exposes exactly one method, and it is not a client', () => {
      const methods = Object.getOwnPropertyNames(TenantDatabaseService.prototype).filter(
        (name) => name !== 'constructor',
      );

      expect(methods).toEqual(['forAdmittedRequest']);
    });

    it('names no client, no transaction and no context function in its source', () => {
      const source = codeOf(TenantDatabaseService.prototype.forAdmittedRequest.toString());

      for (const forbidden of [
        'PrismaClient',
        'PrismaService',
        '$transaction',
        '$connect',
        '$queryRaw',
        '$executeRaw',
        'set_request_context',
        'set_user_context',
        'set_auth_subject_context',
        'set_config',
        'app.practice_id',
      ]) {
        expect([forbidden, source.includes(forbidden)]).toEqual([forbidden, false]);
      }
    });
  });

  describe('clause 6 — it uses the EXISTING pinned session', () => {
    it('runs a feature statement on the session it was handed, and on nothing else', async () => {
      const database = new RecordingDatabase(emptyWorld());

      await database.runBootstrapTransaction(async (session) => {
        const tenant = facade.forAdmittedRequest(session, admittedRequest());

        await tenant.run(statement()).catch(() => undefined);
      });

      // One transaction, opened by the identity bootstrap and by nobody else; the statement is
      // recorded on that same session's ordered log.
      expect(database.transactions).toBe(1);
      expect(database.calls).toEqual([
        'BEGIN',
        'tenant_statement(select patient_reference)',
        'COMMIT',
      ]);
    });

    it('delegates verbatim — it adds no statement, no predicate and no table', async () => {
      const seen: TenantStatement[] = [];
      const session = {
        runTenantStatement: async <TRow>(given: TenantStatement): Promise<readonly TRow[]> => {
          seen.push(given);
          return Promise.resolve([]);
        },
      } as unknown as IdentityBootstrapSession;

      const given = statement();
      const tenant = facade.forAdmittedRequest(session, admittedRequest());

      await tenant.run(given);

      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe(given);
    });
  });

  describe('clause 8 — it opens no second, nested or parallel transaction', () => {
    it('runs many feature statements inside the ONE transaction it was given', async () => {
      const database = new RecordingDatabase(emptyWorld());

      await database.runBootstrapTransaction(async (session) => {
        const tenant = facade.forAdmittedRequest(session, admittedRequest());

        await tenant.run(statement()).catch(() => undefined);
        await tenant.run(statement()).catch(() => undefined);
      });

      expect(database.transactions).toBe(1);
      expect(database.committed).toBe(1);
      expect(database.rolledBack).toBe(0);
      expect(database.calls.filter((call) => call === 'BEGIN')).toHaveLength(1);
    });

    it('has no transaction API a caller could reach', () => {
      const tenant = facade.forAdmittedRequest(
        {} as unknown as IdentityBootstrapSession,
        admittedRequest(),
      );

      expect(Object.keys(tenant).sort()).toEqual(['practiceId', 'run']);
      expect(Object.isFrozen(tenant)).toBe(true);
    });
  });

  describe('clauses 9 and 10 — it establishes nothing and accepts no identity', () => {
    it('establishes no context of its own for an admitted request', async () => {
      const database = new RecordingDatabase(emptyWorld());

      await database.runBootstrapTransaction(async (session) => {
        facade.forAdmittedRequest(session, admittedRequest());
        return Promise.resolve();
      });

      // Building the tenant view runs NOTHING. No identity bootstrap, no `set_request_context`,
      // no statement — only the transaction the caller had already opened is recorded.
      expect(database.calls).toEqual(['BEGIN', 'COMMIT']);
    });

    it('takes exactly two parameters, and neither is a user', () => {
      expect(facade.forAdmittedRequest.bind(facade)).toHaveLength(2);

      const source = codeOf(TenantDatabaseService.prototype.forAdmittedRequest.toString());

      expect(source).not.toContain('userId');
      expect(source).not.toContain('authSubject');
    });

    it('reads the practice from the ADMITTED request and from nowhere else', () => {
      // A practice id is a string anyone can produce; an `AdmittedTenantRequest` is not. The
      // facade requires the latter, so the tenant a feature statement is given is by
      // construction the one the pipeline established in `app.practice_id`.
      const tenant = facade.forAdmittedRequest(
        {} as unknown as IdentityBootstrapSession,
        admittedRequest(OTHER_PRACTICE),
      );

      expect(tenant.practiceId).toBe(OTHER_PRACTICE);

      const source = codeOf(TenantDatabaseService.prototype.forAdmittedRequest.toString());

      expect(source).toContain('admitted.practiceId');
      // No route input is in scope to become a tenant here.
      expect(source).not.toContain('practiceContextHeader');
      expect(source).not.toContain('requestedPracticeId');
    });
  });
});
