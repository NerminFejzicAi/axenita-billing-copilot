/**
 * `08` §12.12 obligations 12 and 13 — the two SERVICE-LEVEL lookups (`CO-P5-I3-I4-1`,
 * `CO-P5-I3-I4-2`).
 *
 * Normative sources: `03` §11; `04` §7.5a.3, *Vlasništvo lookup sposobnosti*; `09` §18.1 threat
 * `T1`; D-060; D-070; D-072 `OD-P5-I4-14`; D-079 `RULING B` items 9-12.
 *
 * BOTH ARE SERVICE CAPABILITIES AND NEITHER HAS AN HTTP ROUTE. That is asserted structurally in
 * `patient-references.controller.ts` — the class declares exactly one `@Get` and one `@Post` —
 * and here by the fact that these methods take an `AdmittedTenantSession` rather than a request.
 *
 * The tenant scoping is proven twice over: this suite drives a second practice through the SAME
 * recording session and observes that neither lookup finds its rows, and
 * `test/phase5-patient-reference-create.security.ts` proves the same property against real
 * `FORCE`-mode row level security.
 */

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RecordingDatabase,
  emptyWorld,
  patientReferenceRow,
  practiceRow,
  type World,
} from '../../../test/support/recording-identity-database.js';
import { type ExternalReferenceIdentity } from '../../crypto/external-reference.port.js';
import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { PatientReferenceDatabase } from '../infrastructure/patient-reference.database.js';
import { PatientReferenceLookupService } from './patient-reference-lookup.service.js';

const SUBJECT = 'dev|physician';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const OTHER_PRACTICE = '11111111-1111-4111-8111-111111111002';
const USER = '22222222-2222-4222-8222-222222222001';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333001';
const OTHER_MEMBERSHIP = '33333333-3333-4333-8333-333333333002';

const OWN_ROW = '77777777-7777-4777-8777-777777770001';
const FOREIGN_ROW = '77777777-7777-4777-8777-777777770002';

const OWN_PSEUDONYM = 'P-K7M2QX4TB9';
/** The SAME pseudonym, stored in ANOTHER practice — the cross-tenant probe. */
const FOREIGN_PSEUDONYM = OWN_PSEUDONYM;

const EXTERNAL_REFERENCE = 'LOCAL-P5I4C-0001';

const PSEUDONYM_LOOKUP = 'tenant_statement(select patient_reference_by_pseudonym)';
const EXTERNAL_LOOKUP = 'tenant_statement(select patient_reference_by_external_reference)';

/** The same deterministic HMAC stand-in the create spec uses; see its rationale there. */
function stubHmac(): { compute(identity: ExternalReferenceIdentity): string } {
  return {
    compute: (identity: ExternalReferenceIdentity): string =>
      `h1.${createHash('sha256')
        .update(
          [identity.domain, identity.practiceId, identity.sourceSystem, identity.value].join(' '),
        )
        .digest('hex')}`,
  };
}

describe('PatientReferenceLookupService (CO-P5-I3-I4-1, CO-P5-I3-I4-2)', () => {
  let world: World;
  let database: RecordingDatabase;
  let hmac: ReturnType<typeof stubHmac>;
  let service: PatientReferenceLookupService;

  beforeEach(() => {
    world = emptyWorld();
    database = new RecordingDatabase(world);
    hmac = stubHmac();
    service = new PatientReferenceLookupService(new PatientReferenceDatabase(), hmac);

    world.bootstrapUsers.push({
      id: USER,
      email: 'physician@example.invalid',
      displayName: 'Dev Physician',
      preferredLanguage: 'de-CH',
      status: 'ACTIVE',
    });
    world.practices.push(practiceRow(PRACTICE, 'Demo Praxis Zuerich'));
    world.practices.push(practiceRow(OTHER_PRACTICE, 'Demo Praxis Nord'));
    world.memberships.push(
      { id: MEMBERSHIP, practiceId: PRACTICE, active: true, userId: USER },
      { id: OTHER_MEMBERSHIP, practiceId: OTHER_PRACTICE, active: true, userId: USER },
    );
    world.membershipRoles.push(
      { membershipId: MEMBERSHIP, practiceId: PRACTICE, role: 'PHYSICIAN' },
      { membershipId: OTHER_MEMBERSHIP, practiceId: OTHER_PRACTICE, role: 'PHYSICIAN' },
    );
    world.settings.push(
      { practiceId: PRACTICE, allowMpaApproval: false, allowBillingSpecialistApproval: false },
      {
        practiceId: OTHER_PRACTICE,
        allowMpaApproval: false,
        allowBillingSpecialistApproval: false,
      },
    );

    // ONE row in the admitted practice and ONE in another, carrying the SAME pseudonym and the
    // SAME external identifier. Nothing but the tenant boundary separates them, which is exactly
    // what makes the cross-tenant assertions meaningful.
    world.patientReferences.push(
      patientReferenceRow(OWN_ROW, PRACTICE, {
        pseudonym: OWN_PSEUDONYM,
        externalPatientRefHash: hmac.compute({
          domain: 'patient_external_ref',
          practiceId: PRACTICE,
          sourceSystem: 'MANUAL',
          value: EXTERNAL_REFERENCE,
        }),
      }),
      patientReferenceRow(FOREIGN_ROW, OTHER_PRACTICE, {
        pseudonym: FOREIGN_PSEUDONYM,
        externalPatientRefHash: hmac.compute({
          domain: 'patient_external_ref',
          practiceId: OTHER_PRACTICE,
          sourceSystem: 'MANUAL',
          value: EXTERNAL_REFERENCE,
        }),
      }),
    );
  });

  /** Admits ONE request for `practiceId` and hands the lookup its statement surface. */
  async function withAdmittedTenant<T>(
    practiceId: string,
    work: (tenant: AdmittedTenantSession) => Promise<T>,
  ): Promise<T> {
    const bootstrap = new IdentityBootstrapService(database);
    const pipeline = new TenantRequestPipeline();
    const facade = new TenantDatabaseService();

    return bootstrap.runAuthenticatedSession(SUBJECT, async (session) => {
      const admitted = await pipeline.admit(session, {
        scope: { mode: 'HEADER_ONLY' },
        practiceContextHeader: practiceId,
        requiredPermission: 'patient_reference.read',
      });

      return work(facade.forAdmittedRequest(session, admitted));
    });
  }

  describe('obligation 12 — lookup by pseudonym', () => {
    it('finds the admitted practice row for the canonical form', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByPseudonym(tenant, OWN_PSEUDONYM),
      );

      expect(found?.id).toBe(OWN_ROW);
      expect(found?.pseudonym).toBe(OWN_PSEUDONYM);
      // The canonical six-field document, and no seventh member — no hash, no tenant, no
      // plaintext identifier.
      expect(Object.keys(found ?? {}).sort()).toEqual([
        'birthYear',
        'createdAt',
        'id',
        'pseudonym',
        'sexCode',
        'sourceSystem',
      ]);
    });

    it('canonicalises ASCII case and then compares with PLAIN equality', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByPseudonym(tenant, OWN_PSEUDONYM.toLowerCase()),
      );

      expect(found?.id).toBe(OWN_ROW);
      // The statement itself compared the UPPERCASE value: the double applies plain equality, so
      // a production path that dropped the canonicaliser would find nothing here.
      expect(database.calls).toContain(PSEUDONYM_LOOKUP);
    });

    it('does NOT find another practice pseudonym, even though the value is identical', async () => {
      const fromOwnPractice = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByPseudonym(tenant, FOREIGN_PSEUDONYM),
      );

      // The same string resolves to the ADMITTED practice's row, never the other one.
      expect(fromOwnPractice?.id).toBe(OWN_ROW);
      expect(fromOwnPractice?.id).not.toBe(FOREIGN_ROW);
    });

    it.each([
      ['a syntactically impossible value', 'not-a-pseudonym'],
      ['an excluded Crockford letter', 'P-IIIIIIIIII'],
      ['a SQL fragment', "P-' or 1=1 --"],
      ['an empty string', ''],
    ])('answers undefined for %s with ZERO statements', async (_name, candidate) => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByPseudonym(tenant, candidate),
      );

      expect(found).toBeUndefined();
      // Refused before the database is reached, so a malformed probe learns nothing at all.
      expect(database.calls).not.toContain(PSEUDONYM_LOOKUP);
    });

    it('answers undefined for a well-formed pseudonym that names no row', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByPseudonym(tenant, 'P-ZZZZZZZZZZ'),
      );

      expect(found).toBeUndefined();
      expect(database.calls).toContain(PSEUDONYM_LOOKUP);
    });
  });

  describe('obligation 13 — lookup by external reference', () => {
    it('finds the row through normalisation, domain, practice, MANUAL and the keyed token', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByExternalReference(tenant, EXTERNAL_REFERENCE),
      );

      expect(found?.id).toBe(OWN_ROW);
      expect(database.calls).toContain(EXTERNAL_LOOKUP);
    });

    it('normalises before keying, so NFC and outer whitespace variants still match', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByExternalReference(tenant, `  ${EXTERNAL_REFERENCE}  `),
      );

      expect(found?.id).toBe(OWN_ROW);
    });

    it('does NOT find another practice row for the SAME external identifier', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByExternalReference(tenant, EXTERNAL_REFERENCE),
      );

      // The token is practice-scoped, so the two practices' rows carry DIFFERENT tokens even
      // though the plaintext identifier is the same — the tenant boundary is in the key as well
      // as in the predicate and the policy.
      expect(found?.id).toBe(OWN_ROW);
      expect(found?.id).not.toBe(FOREIGN_ROW);

      const ownToken = world.patientReferences[0]?.externalPatientRefHash;
      const foreignToken = world.patientReferences[1]?.externalPatientRefHash;

      expect(ownToken).not.toBe(foreignToken);
    });

    it('binds the KEYED TOKEN and never the plaintext identifier', async () => {
      const patientReferences = new PatientReferenceDatabase();
      const bound = vi.spyOn(patientReferences, 'findByExternalReferenceInAdmittedPractice');
      const lookups = new PatientReferenceLookupService(patientReferences, hmac);

      await withAdmittedTenant(PRACTICE, (tenant) =>
        lookups.findByExternalReference(tenant, EXTERNAL_REFERENCE),
      );

      const [, sourceSystem, token] = bound.mock.calls[0] ?? [];

      expect(sourceSystem).toBe('MANUAL');
      expect(token).toMatch(/^h1\.[0-9a-f]{64}$/);
      expect(token).not.toContain(EXTERNAL_REFERENCE);
      expect(JSON.stringify(bound.mock.calls[0])).not.toContain(EXTERNAL_REFERENCE);
    });

    it('answers undefined for a value the MANUAL-v1 profile refuses, with ZERO statements', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByExternalReference(tenant, 'A'.repeat(256)),
      );

      // Such a value could never have been stored, because storing one requires passing this very
      // profile — so `undefined` is truthful, and no statement runs to reveal anything.
      expect(found).toBeUndefined();
      expect(database.calls).not.toContain(EXTERNAL_LOOKUP);
    });

    it('answers undefined for an unknown identifier', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByExternalReference(tenant, 'LOCAL-P5I4C-NEVER-STORED'),
      );

      expect(found).toBeUndefined();
    });
  });

  describe('no plaintext identifier on any lookup surface (obligation 18)', () => {
    it('returns a document that carries neither the identifier nor its token', async () => {
      const found = await withAdmittedTenant(PRACTICE, (tenant) =>
        service.findByExternalReference(tenant, EXTERNAL_REFERENCE),
      );

      const rendered = JSON.stringify(found);

      expect(rendered).not.toContain(EXTERNAL_REFERENCE);
      expect(rendered).not.toContain('h1.');
      expect(rendered).not.toContain(PRACTICE);
    });
  });
});
