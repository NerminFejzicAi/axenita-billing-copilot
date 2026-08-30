/**
 * `GET /api/v1/patient-references/{id}` — MANDATORY FACADE PROOF CLASS 2 OF 2, the BEHAVIOURAL
 * recording-session proof, together with the `P5-I4A` read semantics it exists to protect.
 *
 * Normative sources: `03` §3.7.1, §9 and §11; `09` §18.1 threat `T1`; D-054 clauses 6–10 and 12;
 * D-056 clause 5; D-072 `OD-P5-I4-12` and `OD-P5-I4-13`; D-073 `OD-P5-I4A-1` and `OD-P5-I4A-2`;
 * `08` §12.10 points 2 and 4–6, §12.10a points 2, 8–14.
 *
 * WHAT A STATUS CODE CANNOT SHOW, AND THIS SUITE THEREFORE OWNS
 *
 * 1. THAT THE FEATURE STATEMENT RUNS ON THE ADMITTED PINNED SESSION. Every call — the identity
 *    bootstrap, the tenant admission and the feature read — is appended to ONE ordered log by
 *    ONE recording session, so the whole request is asserted as a sequence rather than as a
 *    collection of facts that happen to be true.
 * 2. THAT NO SECOND, NESTED OR PARALLEL TRANSACTION EXISTS. The recorder counts `BEGIN`,
 *    `COMMIT` and `ROLLBACK` itself.
 * 3. THAT TENANT CONTEXT IS ESTABLISHED BEFORE THE BUSINESS STATEMENT. Asserted by INDEX in the
 *    log, so the statement cannot move one step earlier.
 * 4. THAT NO CALLER-SUPPLIED IDENTITY EXISTS. The membership is resolved against the modelled
 *    `app.user_id`, exactly as the real predicate resolves it.
 * 5. THAT A MALFORMED IDENTIFIER PERFORMS ZERO RESOURCE READS
 *    (`MALFORMED_RESOURCE_UUID_DB_READS = 0`), proven by the absence of the statement from the
 *    log rather than asserted in prose.
 * 6. THAT THE PROTECTED `404` PAIR IS ONE PATH. "No such row" and "another practice's row" are
 *    driven separately and compared field by field, and the executed statements are compared too
 *    — an existence oracle would show up as a second query long before it showed up as a
 *    different body.
 *
 * Real PostgreSQL semantics — FORCE-mode row level security, the `patient_references_select` policy,
 * the transaction-local GUCs and the real HTTP surface — are proven against a real database in
 * `test/phase5-patient-reference-read.security.ts`. Both halves are required; neither replaces
 * the other.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { type PatientReferenceResponseDto } from '@axenita/contracts';

import {
  RecordingDatabase,
  emptyWorld,
  patientReferenceRow,
  practiceRow,
  type World,
} from '../../../test/support/recording-identity-database.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { PATIENT_REFERENCE_READ_STATEMENT } from '../infrastructure/patient-reference-database.port.js';
import { PatientReferenceDatabase } from '../infrastructure/patient-reference.database.js';
import { PatientReferenceReadService } from './patient-reference-read.service.js';

const SUBJECT = 'dev|physician';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const OTHER_PRACTICE = '11111111-1111-4111-8111-111111111002';
const USER = '22222222-2222-4222-8222-222222222001';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';

const RESOURCE = '44444444-4444-4444-8444-444444444001';
const ABSENT_RESOURCE = '44444444-4444-4444-8444-4444444440ff';
const FOREIGN_RESOURCE = '44444444-4444-4444-8444-4444444440aa';

/** The recorded feature statement, under the adapter's own source-code label. */
const FEATURE_STATEMENT = `tenant_statement(${PATIENT_REFERENCE_READ_STATEMENT})`;

/** The recorded chain of the authenticated half, which this route never performs itself. */
const ADMISSION = [
  'BEGIN',
  `set_auth_subject_context(${SUBJECT})`,
  'select users',
  `set_user_context(${USER})`,
];

/** The recorded chain of the tenant half — the SAME steps every practice-path route runs. */
const TENANT_ADMISSION = [
  `select practice(${PRACTICE})`,
  `select current_membership(${USER},${PRACTICE})`,
  `set_request_context(${PRACTICE})`,
  `select membership_roles(${MEMBERSHIP})`,
  `select practice_settings(${PRACTICE})`,
];

describe('PatientReferenceReadService', () => {
  let world: World;
  let database: RecordingDatabase;
  let service: PatientReferenceReadService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);

    const bootstrap = new IdentityBootstrapService(database);

    service = new PatientReferenceReadService(
      bootstrap,
      new TenantRequestPipeline(),
      new TenantDatabaseService(),
      new PatientReferenceDatabase(),
    );
  });

  /** A caller who is admitted and who derives `patient_reference.read` (`15` §5: PHYSICIAN). */
  function seedEligibleCaller(): void {
    world.bootstrapUsers.push({
      id: USER,
      email: 'physician@example.invalid',
      displayName: 'Dev Physician',
      preferredLanguage: 'de-CH',
      status: 'ACTIVE',
    });
    world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
    world.practices.push(practiceRow(OTHER_PRACTICE, 'Demo Praxis Nord'));
    world.memberships.push({ id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER });
    world.membershipRoles.push({
      membershipId: MEMBERSHIP,
      practiceId: PRACTICE,
      role: 'PHYSICIAN',
    });
    world.settings.push({
      practiceId: PRACTICE,
      allowMpaApproval: false,
      allowBillingSpecialistApproval: false,
    });
  }

  /**
   * One request. `header: null` means "send no `X-Practice-ID` at all"; any string is forwarded
   * verbatim and unvalidated, exactly as the controller forwards a raw header value.
   */
  function read(
    resourceId: string,
    header: string | null = PRACTICE,
  ): Promise<PatientReferenceResponseDto> {
    return service.loadPatientReference({
      verifiedAuthSubject: SUBJECT,
      resourceId,
      practiceContextHeader: header ?? undefined,
    });
  }

  async function refusalOf(
    resourceId: string,
    header: string | null = PRACTICE,
  ): Promise<ApiException> {
    const failure = await read(resourceId, header).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiException);

    return failure as ApiException;
  }

  describe('behavioural facade proof (D-072 OD-P5-I4-12, 08 §12.10 point 2)', () => {
    it('runs the whole request as ONE ordered chain on ONE pinned session', async () => {
      seedEligibleCaller();
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

      await read(RESOURCE);

      // The complete sequence, asserted as a sequence. The feature statement is the LAST thing
      // that happens before `COMMIT`, and everything before it is the canonical `03` §3.7.1
      // chain — unchanged, and not re-implemented by this route.
      expect(database.calls).toEqual([
        ...ADMISSION,
        ...TENANT_ADMISSION,
        FEATURE_STATEMENT,
        'COMMIT',
      ]);
    });

    it('opens exactly one transaction, and never a second, nested or parallel one', async () => {
      seedEligibleCaller();
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

      await read(RESOURCE);

      expect(database.transactions).toBe(1);
      expect(database.committed).toBe(1);
      expect(database.rolledBack).toBe(0);
      expect(database.calls.filter((call) => call === 'BEGIN')).toHaveLength(1);
    });

    it('establishes tenant context strictly BEFORE the business statement', async () => {
      seedEligibleCaller();
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

      await read(RESOURCE);

      const context = database.calls.indexOf(`set_request_context(${PRACTICE})`);
      const feature = database.calls.indexOf(FEATURE_STATEMENT);

      expect(context).toBeGreaterThanOrEqual(0);
      expect(feature).toBeGreaterThan(context);
    });

    it('supplies no caller identity anywhere — the membership comes from app.user_id', async () => {
      seedEligibleCaller();
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

      await read(RESOURCE);

      // The recorded membership lookup carries the identity the session ESTABLISHED, which is
      // the only identity reachable on this path (D-054 clause 12).
      expect(database.calls).toContain(`select current_membership(${USER},${PRACTICE})`);

      const request = Object.keys({
        verifiedAuthSubject: SUBJECT,
        resourceId: RESOURCE,
        practiceContextHeader: PRACTICE,
      });

      expect(request).not.toContain('userId');
    });

    it('reaches the database for a refused request not at all beyond admission', async () => {
      // A caller with no membership is refused by the shared pipeline, and the feature statement
      // never runs. The transaction rolls back, discarding every `app.*` setting.
      world.bootstrapUsers.push({
        id: USER,
        email: 'physician@example.invalid',
        displayName: 'Dev Physician',
        preferredLanguage: 'de-CH',
        status: 'ACTIVE',
      });
      world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));

      const failure = await refusalOf(RESOURCE);

      expect(failure.getStatus()).toBe(403);
      expect(database.calls).not.toContain(FEATURE_STATEMENT);
      expect(database.rolledBack).toBe(1);
    });
  });

  describe('tenant scope is HEADER_ONLY (D-073 OD-P5-I4A-1, 08 §12.10a point 2)', () => {
    it('derives the admitted practice EXCLUSIVELY from the validated header', async () => {
      seedEligibleCaller();
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

      await read(RESOURCE);

      // The only practice named anywhere in the recorded chain is the header's, and the request
      // object carries no path practice at all.
      expect(database.calls).toContain(`set_request_context(${PRACTICE})`);
      expect(database.calls.some((call) => call.includes(OTHER_PRACTICE))).toBe(false);
    });

    it('accepts no path/caller practice id — the request shape has no member for one', () => {
      const source = PatientReferenceReadService.prototype.loadPatientReference.toString();

      // `HEADER_ONLY` carries no practice member, so there is nothing to pass and nothing to
      // compare. A route that reintroduced the seam would have to name it here.
      expect(source).toContain("mode: 'HEADER_ONLY'");
      expect(source).not.toContain('requestedPracticeId');
    });

    it('still enforces the unchanged X-Practice-ID rules', async () => {
      seedEligibleCaller();
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

      const absent = await refusalOf(RESOURCE, null);
      expect(absent.getStatus()).toBe(400);
      expect(absent.code).toBe('PRACTICE_CONTEXT_REQUIRED');

      const malformed = await refusalOf(RESOURCE, 'not-a-uuid');
      expect(malformed.getStatus()).toBe(400);
      expect(malformed.code).toBe('PRACTICE_CONTEXT_INVALID');
    });

    it('refuses a caller who does not derive patient_reference.read', async () => {
      seedEligibleCaller();
      // `15` §5: `patient_reference.read` is a DENY for `PRACTICE_ADMIN`.
      world.membershipRoles[0] = {
        membershipId: MEMBERSHIP,
        practiceId: PRACTICE,
        role: 'PRACTICE_ADMIN',
      };
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

      const failure = await refusalOf(RESOURCE);

      expect(failure.getStatus()).toBe(403);
      expect(failure.code).toBe('ACCESS_DENIED');
      expect(database.calls).not.toContain(FEATURE_STATEMENT);
    });
  });

  describe('malformed identifier (D-073 OD-P5-I4A-2, 08 §12.10a points 8-11)', () => {
    const MALFORMED = [
      'not-a-uuid',
      '',
      ' ',
      '44444444-4444-4444-8444-44444444400',
      '44444444-4444-4444-8444-4444444440011',
      '44444444444444448444444444444001',
      "44444444-4444-4444-8444-444444444001' or '1'='1",
      '44444444-4444-4444-8444-44444444400g',
      '../../etc/passwd',
    ] as const;

    it.each(MALFORMED)('rejects %j with 400 VALIDATION_ERROR', async (malformed) => {
      seedEligibleCaller();

      const failure = await refusalOf(malformed);

      expect(failure.getStatus()).toBe(400);
      expect(failure.code).toBe('VALIDATION_ERROR');
    });

    it('performs ZERO patient_references reads for every malformed identifier', async () => {
      // `MALFORMED_RESOURCE_UUID_DB_READS = 0`, proven by the ABSENCE of the statement from the
      // recorded log — not by an assertion about intent. No tenant-scoped read, no untenanted
      // read and no cross-tenant lookup exists on this branch.
      for (const malformed of MALFORMED) {
        world = emptyWorld();
        database = new RecordingDatabase(world);
        service = new PatientReferenceReadService(
          new IdentityBootstrapService(database),
          new TenantRequestPipeline(),
          new TenantDatabaseService(),
          new PatientReferenceDatabase(),
        );
        seedEligibleCaller();
        world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));

        await refusalOf(malformed);

        expect([malformed, database.calls.includes(FEATURE_STATEMENT)]).toEqual([malformed, false]);
        expect([malformed, database.calls.filter((c) => c.startsWith('tenant_statement'))]).toEqual(
          [malformed, []],
        );
      }
    });

    it('answers every malformed identifier with the SAME static body', async () => {
      seedEligibleCaller();

      const bodies = [];

      for (const malformed of MALFORMED) {
        const failure = await refusalOf(malformed);

        bodies.push({
          code: failure.code,
          status: failure.getStatus(),
          detail: failure.detail,
          errors: failure.errors,
        });
      }

      // Every entry identical to the first: the detail does not vary with the input.
      for (const body of bodies) {
        expect(body).toEqual(bodies[0]);
      }
    });

    it('reflects the identifier neither whole, nor truncated, nor as prefix or suffix', async () => {
      seedEligibleCaller();

      const crafted = 'REFLECT-ME-9f2c1a7b';
      const failure = await refusalOf(crafted);
      const rendered = JSON.stringify({
        detail: failure.detail,
        message: failure.message,
        errors: failure.errors,
      });

      expect(rendered).not.toContain(crafted);
      // No fragment either: every substring of length four upwards is checked.
      for (let length = 4; length <= crafted.length; length += 1) {
        for (let start = 0; start + length <= crafted.length; start += 1) {
          expect(rendered).not.toContain(crafted.slice(start, start + length));
        }
      }
    });

    it('carries no field-level errors[] member introduced for this case', async () => {
      seedEligibleCaller();

      const failure = await refusalOf('not-a-uuid');

      expect(failure.errors).toBeUndefined();
    });
  });

  describe('protected 404 pair (D-073, 09 §18.1 T1, 08 §12.10 points 5-6)', () => {
    beforeEach(() => {
      seedEligibleCaller();
      // One row in the admitted practice, and one row of ANOTHER practice with a different id.
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));
      world.patientReferences.push(patientReferenceRow(FOREIGN_RESOURCE, OTHER_PRACTICE));
    });

    it('answers a valid, nonexistent id with 404 RESOURCE_NOT_FOUND', async () => {
      const failure = await refusalOf(ABSENT_RESOURCE);

      expect(failure.getStatus()).toBe(404);
      expect(failure.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('answers a valid, cross-tenant id with the SAME 404 RESOURCE_NOT_FOUND', async () => {
      const failure = await refusalOf(FOREIGN_RESOURCE);

      expect(failure.getStatus()).toBe(404);
      expect(failure.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('makes the two observably indistinguishable, field by field', async () => {
      const absent = await refusalOf(ABSENT_RESOURCE);

      database.calls.length = 0;

      const foreign = await refusalOf(FOREIGN_RESOURCE);

      expect({
        code: foreign.code,
        status: foreign.getStatus(),
        detail: foreign.detail,
        message: foreign.message,
        errors: foreign.errors,
        name: foreign.name,
      }).toEqual({
        code: absent.code,
        status: absent.getStatus(),
        detail: absent.detail,
        message: absent.message,
        errors: absent.errors,
        name: absent.name,
      });

      // The member ORDER of the rendered document is part of "indistinguishable".
      expect(Object.keys(foreign.getResponse() as object)).toEqual(
        Object.keys(absent.getResponse() as object),
      );
    });

    it('executes the SAME statements for both causes — no existence oracle', async () => {
      await refusalOf(ABSENT_RESOURCE);
      const absentCalls = [...database.calls];

      database.calls.length = 0;
      await refusalOf(FOREIGN_RESOURCE);
      const foreignCalls = [...database.calls];

      // Identical sequences, and exactly ONE feature statement in each. A discriminating second
      // query would appear here long before it appeared in a response body.
      expect(foreignCalls).toEqual(absentCalls);
      expect(foreignCalls.filter((call) => call === FEATURE_STATEMENT)).toHaveLength(1);
    });
  });

  describe('the admitted read (03 §11, 08 §12.10 point 4)', () => {
    beforeEach(() => {
      seedEligibleCaller();
      world.patientReferences.push(patientReferenceRow(RESOURCE, PRACTICE));
    });

    it('returns exactly the six public fields for a same-tenant row', async () => {
      const document = await read(RESOURCE);

      expect(Object.keys(document).sort()).toEqual([
        'birthYear',
        'createdAt',
        'id',
        'pseudonym',
        'sexCode',
        'sourceSystem',
      ]);
      expect(document).toEqual({
        id: RESOURCE,
        pseudonym: 'P-K7M2QX4TB9',
        birthYear: 1968,
        sexCode: 'F',
        sourceSystem: 'MANUAL',
        createdAt: '2026-07-18T10:00:00.000Z',
      });
    });

    it('issues EXACTLY ONE patient-reference statement', async () => {
      await read(RESOURCE);

      expect(database.calls.filter((call) => call === FEATURE_STATEMENT)).toHaveLength(1);
      expect(database.calls.filter((call) => call.startsWith('tenant_statement'))).toHaveLength(1);
    });

    it('exposes no internal field of the stored row', async () => {
      const document = await read(RESOURCE);
      const rendered = JSON.stringify(document);

      for (const forbidden of [
        'practiceId',
        'practice_id',
        'updatedAt',
        'updated_at',
        'externalPatientRef',
        'external_patient_ref',
        'ciphertext',
        'authTag',
        'auth_tag',
        'iv',
        'encryption',
      ]) {
        expect([forbidden, Object.keys(document).includes(forbidden)]).toEqual([forbidden, false]);
        expect([forbidden, rendered.includes(`"${forbidden}"`)]).toEqual([forbidden, false]);
      }
    });
  });
});
