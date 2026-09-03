/**
 * The recording {@link IdentityDatabase} shared by the phase 3 application unit specs.
 *
 * WHY A RECORDER AND NOT A MOCK
 *
 * The property the accepted decisions fix is not "the endpoint answers 403" but WHERE in the
 * chain it answers it (`03` §3.1, §3.7.1, D-047 clauses 2–4, 9 and 10). A loose mock proves
 * nothing about order. This double therefore stores rows, applies the same scoping the real SQL
 * applies, and appends every call — including `BEGIN`, `COMMIT` and `ROLLBACK` — to one ordered
 * log, so a spec can assert the sequence itself.
 *
 * ONE HARNESS, NOT TWO. `GET /me` and `GET /practices/{practiceId}` share the same bootstrap
 * chain and therefore share this recorder. A second, parallel fake database stack would be free
 * to drift from this one and from the real adapter, which is exactly the failure mode these
 * specs exist to prevent. `P5-I4A` extended it with the SMALL_ADAPTER seam and `P5-I4C` extends
 * it again with the eight statements of the write path — the advisory lock, the claim, the
 * completion, the targeted insert, the two service-level lookups and the audit append — for the
 * same reason: a parallel ungoverned DB test seam is forbidden (D-072 `OD-P5-I4-12`).
 *
 * IT MODELS THE TWO GUCS THE POLICIES READ. `app.user_id` and `app.practice_id` are held as
 * session state and the reads apply the same predicates the accepted policies apply — most
 * importantly the RESTRICTIVE narrowing of `practices` (`02` §17.6) and the tenant predicate on
 * `practice_settings` (§17.1, package `013`). Without that, a unit spec could not observe the
 * D-053 ordering requirement at all: a `practiceName` read after the first `set_request_context`
 * would look perfectly fine here while losing every other membership's name against a real
 * database. `set_request_context` reproduces the clear-before-validate order and the
 * ACTIVE-membership requirement of `02` §16.2.3 for the same reason.
 *
 * Real PostgreSQL semantics — RLS policies, transaction-local GUCs, column grants, request to
 * request isolation — are proven separately against a real database in
 * `test/phase3-identity-*.security.ts` and `test/phase3-practice-read.security.ts`. This module
 * is the ordering and projection harness and is not a substitute for those.
 */

import { AUDIT_EVENT_INSERT_STATEMENT } from '../../src/audit/infrastructure/audit-database.port.js';
import { type TenantStatement } from '../../src/database/tenant-statement.js';
import {
  IDEMPOTENCY_ADVISORY_LOCK_STATEMENT,
  IDEMPOTENCY_CLAIM_INSERT_STATEMENT,
  IDEMPOTENCY_CLAIM_READ_STATEMENT,
  IDEMPOTENCY_COMPLETION_UPDATE_STATEMENT,
} from '../../src/idempotency/infrastructure/idempotency-database.port.js';
import {
  DuplicateExternalReferenceError,
  PATIENT_REFERENCE_EXTERNAL_REFERENCE_LOOKUP_STATEMENT,
  PATIENT_REFERENCE_INSERT_STATEMENT,
  PATIENT_REFERENCE_PSEUDONYM_LOOKUP_STATEMENT,
  PATIENT_REFERENCE_READ_STATEMENT,
  type PatientReferenceRow,
} from '../../src/patient-reference/infrastructure/patient-reference-database.port.js';
import {
  TenantContextRejectedError,
  type BootstrapUserRow,
  type ConditionalSettingsRow,
  type IdentityBootstrapSession,
  type IdentityDatabase,
  type MembershipRoleRow,
  type MembershipRow,
  type PlatformRoleRow,
  type PracticeRow,
  type PracticeSettingsRow,
  type PracticeSettingsUpdate,
  type RequestedPracticeRow,
} from '../../src/identity/infrastructure/identity-database.port.js';

/** A membership row plus the owning user, which the real query filters on. */
export interface OwnedMembership extends MembershipRow {
  readonly userId: string;
}

/** A platform assignment plus the owning user, which the real query filters on. */
export interface OwnedPlatformRole extends PlatformRoleRow {
  readonly userId: string;
}

/**
 * A `patient_references` row plus its owning practice — the tenant key the `013_rls_policies_
 * phase5` policy filters on and the real statement predicates on.
 *
 * `practiceId` is NOT a member of {@link PatientReferenceRow}: the statement never projects the
 * tenant of a row, so neither does the double.
 */
export interface OwnedPatientReference extends PatientReferenceRow {
  readonly practiceId: string;
  /**
   * `external_patient_ref_hash` — the keyed token, held so that
   * `patient_references_source_external_ref_key` can be modelled.
   *
   * It is NOT a member of {@link PatientReferenceRow} and never travels out of the double: the
   * statement never projects it, and neither does this harness (D-060 clause 38).
   */
  readonly externalPatientRefHash?: string;
}

/**
 * One `idempotency_keys` row, in the shape the double stores it.
 *
 * The four scope columns are held alongside the mutable ones because the real statements
 * predicate on all four (`02` §15.2), so a statement that stopped binding one would stop matching
 * here too.
 */
export interface StoredIdempotencyKey {
  readonly id: string;
  readonly practiceId: string;
  readonly userId: string;
  readonly endpoint: string;
  readonly idempotencyKey: string;
  readonly requestSha256: string;
  readonly responseStatus: number | null;
  readonly responseBody: unknown;
  readonly lockedAt: Date | null;
  readonly completedAt: Date | null;
  readonly expiresAt: Date | null;
}

/**
 * One `audit_events` row, in the shape the double stores it — ALL SEVENTEEN columns.
 *
 * Seventeen and not eleven: the six the statement writes as SQL `NULL` are stored as `null` here
 * too, so a spec can reproduce `AUDIT_EVENT_HASH_PAYLOAD_V1` FROM THE STORED ROW rather than from
 * the object the writer happened to build (`08` §12.12 obligation 16).
 */
export interface StoredAuditEvent {
  readonly id: string;
  readonly practiceId: string;
  readonly occurredAt: Date;
  readonly actorType: string;
  readonly actorUserId: string | null;
  readonly actorService: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly requestId: string | null;
  readonly sessionIdHash: string | null;
  readonly ipAddress: string | null;
  readonly userAgentHash: string | null;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly metadata: unknown;
  readonly eventSha256: string;
  readonly previousEventSha256: string | null;
}

/**
 * A `patient_references` row with obviously synthetic, non-PHI defaults (`09` §9).
 *
 * `createdAt` defaults to a whole second on purpose: it is the vector that proves the public
 * serialiser emits `.000` rather than eliding the fractional part (D-073 `OD-P5-I4A-3`).
 */
export function patientReferenceRow(
  id: string,
  practiceId: string,
  overrides: Partial<OwnedPatientReference> = {},
): OwnedPatientReference {
  return {
    id,
    practiceId,
    pseudonym: 'P-K7M2QX4TB9',
    birthYear: 1968,
    sexCode: 'F',
    sourceSystem: 'MANUAL',
    createdAt: new Date('2026-07-18T10:00:00Z'),
    // A syntactically canonical `h1.<64 hex>` token derived from the row id, so that a stored
    // fixture is distinct per row without any spec having to invent one. It is a FIXTURE, not a
    // real digest, and it never leaves the double.
    externalPatientRefHash: `h1.${id.replace(/-/g, '').padEnd(64, '0').slice(0, 64)}`,
    ...overrides,
  };
}

/**
 * One `practice_settings` row, in the shape the double stores it.
 *
 * ONE TABLE, ONE ROW STORE. Two statements read this table — the three-column conditional input
 * of `03` §3.7.1 step 9 and the nine-column representation of step 11 — and they must be able to
 * disagree about NOTHING. A second store for the representation would let a spec set flags in one
 * and different flags in the other, and a production bug that read the wrong surface would then
 * pass. The columns beyond the conditional three are therefore OPTIONAL rather than separate: a
 * spec that only cares about permission derivation keeps writing the three it always wrote, and
 * {@link settingsRow} fills the rest with the accepted development defaults of `02` §23.2 when a
 * spec cares about the representation.
 */
export interface SettingsRow extends ConditionalSettingsRow {
  readonly billingReviewRequired?: boolean;
  readonly requireReasonForManualChange?: boolean;
  readonly aiEnabled?: boolean;
  readonly axenitaExportEnabled?: boolean;
  readonly retentionPolicyCode?: string | null;
  readonly version?: number;
}

export interface World {
  /** Rows the bootstrap policy of `02` §17.5 would expose for the verified subject. */
  bootstrapUsers: BootstrapUserRow[];
  memberships: OwnedMembership[];
  /**
   * Practices, held in their FULL granted shape.
   *
   * There is one `practices` table, so there is one row type here. `findPractices` projects it
   * down to what `GET /me` renders and `findRequestedPractice` returns all six granted columns,
   * exactly as the two real statements do.
   */
  practices: RequestedPracticeRow[];
  membershipRoles: MembershipRoleRow[];
  /**
   * `practice_settings`, held in the FULL granted shape.
   *
   * There is one `practice_settings` table, so there is one row store here.
   * `findConditionalSettings` projects it down to the three permission-derivation columns and
   * `findPracticeSettings` returns all nine granted ones, exactly as the two real statements do.
   */
  settings: SettingsRow[];
  platformRoles: OwnedPlatformRole[];
  /**
   * `patient_references`, held with the OWNING PRACTICE alongside the six public columns.
   *
   * The tenant key is stored because the real policy filters on it and the real statement
   * predicates on it — but it is deliberately NOT part of {@link PatientReferenceRow}, which is
   * the six-column projection the statement returns. Keeping the two apart here is what lets a
   * spec store a row that belongs to ANOTHER practice and then observe that the read cannot see
   * it, without the tenant column ever being reachable from the projected row (M-1).
   */
  patientReferences: OwnedPatientReference[];
  /**
   * `idempotency_keys`, with the FULL four-component scope alongside the mutable columns.
   *
   * A spec seeds a row here to drive a replay, an idempotency conflict or an unfinished claim,
   * and reads it back to assert what the completion actually wrote.
   */
  idempotencyKeys: StoredIdempotencyKey[];
  /**
   * `audit_events`, append-only.
   *
   * The double never updates or deletes an entry, exactly as the grant never permits one
   * (`02` §29.4a.4), so a spec asserting "exactly one row, and only for a successful create"
   * asserts against a store that could not have lost one.
   */
  auditEvents: StoredAuditEvent[];
  /**
   * Advisory-lock keys held by ANOTHER transaction, as decimal `int64` strings.
   *
   * The genuinely concurrent proof needs a real database and lives in
   * `test/phase5-patient-reference-create.security.ts`. This member models the OBSERVABLE
   * consequence of losing the race — `pg_try_advisory_xact_lock` returning `false` without
   * waiting — so that a unit spec can assert the `409` branch deterministically. Seeding it is
   * the exact analogue of `contextRaces` above: a state the application cannot reach by choosing
   * its own inputs is injected at the point the database would report it.
   */
  heldAdvisoryLocks: string[];
  /**
   * Practices whose `set_request_context` refuses even though the membership rows say it
   * should succeed — the RACE of D-033 clause 11.
   *
   * It exists because that race is the one path to a real `42501` that an application cannot
   * reach by choosing its inputs: every deterministic cause is already refused, earlier and by
   * name, at the application layer. A concurrent transaction deactivating the membership
   * between the application check and the function call is not reproducible from a spec, so it
   * is injected here instead — at exactly the point where the database would refuse, in
   * exactly the shape it refuses with.
   */
  contextRaces: string[];
}

/** An `ACTIVE` practice with the accepted development defaults of `02` §23.2. */
export function practiceRow(
  id: string,
  name: string,
  overrides: Partial<RequestedPracticeRow> = {},
): RequestedPracticeRow {
  return {
    id,
    code: `code-${id.slice(-4)}`,
    name,
    defaultLanguage: 'de-CH',
    timezone: 'Europe/Zurich',
    status: 'ACTIVE',
    ...overrides,
  };
}

/**
 * A `practice_settings` row with the accepted development defaults of `02` §23.2.
 *
 * The counterpart of {@link practiceRow}: it exists so that a spec asserting the settings
 * REPRESENTATION states only the columns it is actually about, while the row still carries every
 * granted column with a definite value. `version` defaults to `1`, which is the column default of
 * `02` §6.4 and therefore what a freshly seeded practice really holds.
 */
export function settingsRow(practiceId: string, overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    practiceId,
    billingReviewRequired: true,
    allowMpaApproval: false,
    allowBillingSpecialistApproval: false,
    requireReasonForManualChange: true,
    aiEnabled: false,
    axenitaExportEnabled: false,
    retentionPolicyCode: null,
    version: 1,
    ...overrides,
  };
}

export function emptyWorld(): World {
  return {
    bootstrapUsers: [],
    memberships: [],
    practices: [],
    membershipRoles: [],
    settings: [],
    platformRoles: [],
    patientReferences: [],
    idempotencyKeys: [],
    auditEvents: [],
    heldAdvisoryLocks: [],
    contextRaces: [],
  };
}

/**
 * Records every session call and the arguments that matter, so a spec can assert the sequence.
 *
 * It also enforces one rule of its own: a session method called after the transaction callback
 * returned throws. That turns "the code kept a client and used it later" into a failure.
 */
export class RecordingDatabase implements IdentityDatabase {
  public readonly calls: string[] = [];
  public transactions = 0;
  public committed = 0;
  public rolledBack = 0;

  public constructor(private readonly world: World) {}

  public async runBootstrapTransaction<T>(
    work: (session: IdentityBootstrapSession) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    this.calls.push('BEGIN');

    const session = this.createSession();

    // THE PHASE-5 WRITE STORES ARE SNAPSHOTTED, so that `ROLLBACK` means what it means in
    // PostgreSQL: no row survives a failed transaction. Without this a unit spec could not
    // observe the atomicity requirement of `04` §7.5a.3 at all — an audit failure would leave the
    // `patient_references` row and the completed claim visibly behind here while a real database
    // discarded all three.
    //
    // The three arrays are restored IN PLACE, so a spec holding a reference to `world.auditEvents`
    // keeps observing the same array. The phase-3 and phase-4 stores are deliberately NOT
    // snapshotted: no existing spec writes to them through this seam, and changing their
    // behaviour would alter merged, accepted tests.
    const snapshots: readonly [unknown[], unknown[]][] = [
      [this.world.patientReferences, [...this.world.patientReferences]],
      [this.world.idempotencyKeys, [...this.world.idempotencyKeys]],
      [this.world.auditEvents, [...this.world.auditEvents]],
    ];

    try {
      const result = await work(session);
      this.calls.push('COMMIT');
      this.committed += 1;
      return result;
    } catch (error) {
      for (const [live, snapshot] of snapshots) {
        live.splice(0, live.length, ...snapshot);
      }

      this.calls.push('ROLLBACK');
      this.rolledBack += 1;
      throw error;
    }
  }

  private createSession(): IdentityBootstrapSession {
    const world = this.world;
    const calls = this.calls;

    // The two transaction-local GUCs the policies read. Modelling them is what lets a unit spec
    // observe the SAME narrowing the database performs — most importantly that `practices` goes
    // down to one row once `app.practice_id` exists (§17.6 RESTRICTIVE) and that
    // `practice_settings` is unreadable until it does (§17.1).
    let appUserId: string | undefined;
    let appPracticeId: string | undefined;

    /** `practices_context_narrow` (§17.6), RESTRICTIVE: no context, or exactly this practice. */
    const narrowed = (id: string): boolean => appPracticeId === undefined || id === appPracticeId;

    return {
      setAuthSubjectContext: async (authSubject: string): Promise<void> => {
        calls.push(`set_auth_subject_context(${authSubject})`);
        // 02 §16.2.4 — the function clears both downstream contexts.
        appUserId = undefined;
        appPracticeId = undefined;
        return Promise.resolve();
      },
      findUsersForVerifiedSubject: async (): Promise<readonly BootstrapUserRow[]> => {
        calls.push('select users');
        return Promise.resolve(world.bootstrapUsers);
      },
      setUserContext: async (userId: string): Promise<void> => {
        calls.push(`set_user_context(${userId})`);
        appUserId = userId;
        return Promise.resolve();
      },
      setRequestContext: async (practiceId: string): Promise<void> => {
        calls.push(`set_request_context(${practiceId})`);

        // CLEAR BEFORE VALIDATE, exactly as 02 §16.2.3 orders it (D-033 clause 10). A rejected
        // target must not leave the previous practice active, and modelling that here is what
        // makes "the application relies on the function to switch cleanly" testable.
        appPracticeId = undefined;

        if (appUserId === undefined) {
          throw new TenantContextRejectedError();
        }

        // The injected race, checked exactly where the function's own membership validation
        // sits: the GUC has already been cleared, and no context is established.
        if (world.contextRaces.includes(practiceId)) {
          throw new TenantContextRejectedError();
        }

        const eligible = world.memberships.some(
          (row) => row.practiceId === practiceId && row.userId === appUserId && row.active === true,
        );

        if (!eligible) {
          // The function raises 42501 for a foreign practice AND for an inactive membership
          // (D-033 clause 11). A spec can therefore assert that `/me` never calls it for one.
          //
          // The REAL adapter translates that SQLSTATE into `TenantContextRejectedError` and
          // never lets a driver error escape, so this double raises the same type. Raising a
          // bare `Error` here would let a spec pass while the production mapping was missing.
          throw new TenantContextRejectedError();
        }

        appPracticeId = practiceId;
        return Promise.resolve();
      },
      findMemberships: async (userId: string): Promise<readonly MembershipRow[]> => {
        calls.push(`select memberships(${userId})`);
        return Promise.resolve(world.memberships.filter((row) => row.userId === userId));
      },
      findCurrentUserMembershipInPractice: async (
        practiceId: string,
      ): Promise<MembershipRow | undefined> => {
        // The recorded user is the one the statement DERIVES, never one it was handed: the real
        // predicate is `user_id = nullif(current_setting('app.user_id', true), '')::uuid`, so the
        // modelled GUC is the only identity available here too (D-054 clause 12). Recording it
        // is what lets a spec assert that the membership was resolved against the authenticated
        // identity and not against some other value the caller supplied.
        calls.push(`select current_membership(${appUserId ?? 'null'},${practiceId})`);

        // No context, no identity, no rows — `user_id = NULL` is NULL, exactly as in the
        // database. Fail closed.
        if (appUserId === undefined) {
          return Promise.resolve(undefined);
        }

        // Both predicates, exactly as the real statement applies them.
        return Promise.resolve(
          world.memberships.find(
            (row) => row.userId === appUserId && row.practiceId === practiceId,
          ),
        );
      },
      findPractices: async (practiceIds: readonly string[]): Promise<readonly PracticeRow[]> => {
        calls.push(`select practices(${[...practiceIds].sort().join(',')})`);
        return Promise.resolve(
          world.practices
            .filter((row) => practiceIds.includes(row.id) && narrowed(row.id))
            // `GET /me` renders `practiceName` only, so the real query selects two columns.
            .map((row): PracticeRow => ({ id: row.id, name: row.name })),
        );
      },
      findRequestedPractice: async (
        practiceId: string,
      ): Promise<RequestedPracticeRow | undefined> => {
        calls.push(`select practice(${practiceId})`);
        return Promise.resolve(
          world.practices.find((row) => row.id === practiceId && narrowed(row.id)),
        );
      },
      findMembershipRoles: async (
        membershipIds: readonly string[],
      ): Promise<readonly MembershipRoleRow[]> => {
        calls.push(`select membership_roles(${[...membershipIds].sort().join(',')})`);
        return Promise.resolve(
          world.membershipRoles.filter((row) => membershipIds.includes(row.membershipId)),
        );
      },
      findConditionalSettings: async (
        practiceIds: readonly string[],
      ): Promise<readonly ConditionalSettingsRow[]> => {
        calls.push(`select practice_settings(${[...practiceIds].sort().join(',')})`);
        // `practice_settings_select` (§17.1, package `013`): the tenant predicate is the PRIMARY
        // control. Without `app.practice_id` it is `practice_id = NULL` and no row is visible at
        // all; with it, only that one practice's row is. The requested-id filter is applied on
        // top, as the second barrier the real statement also keeps.
        return Promise.resolve(
          world.settings
            .filter(
              (row) =>
                appPracticeId !== undefined &&
                row.practiceId === appPracticeId &&
                practiceIds.includes(row.practiceId),
            )
            // Projected down to the THREE granted columns of the real statement. The store holds
            // all nine, but this surface must not hand the permission resolver a member it could
            // never have read — otherwise a production widening of the derivation input would go
            // unnoticed here.
            .map((row): ConditionalSettingsRow => ({
              practiceId: row.practiceId,
              allowMpaApproval: row.allowMpaApproval,
              allowBillingSpecialistApproval: row.allowBillingSpecialistApproval,
            })),
        );
      },
      findPracticeSettings: async (
        practiceId: string,
      ): Promise<PracticeSettingsRow | undefined> => {
        calls.push(`select settings_representation(${practiceId})`);

        // Recorded under its OWN name, distinct from `select practice_settings(...)` above. The
        // two statements read the same table for opposite purposes — one decides authorisation,
        // the other builds the document — and a spec must be able to assert that BOTH happened,
        // in that order, and that neither was silently substituted for the other.
        //
        // The same `practice_settings_select` predicate (§17.1) applies: no `app.practice_id`,
        // no row, for every practice. The requested-id filter is the second barrier the real
        // statement also keeps.
        if (appPracticeId === undefined || practiceId !== appPracticeId) {
          return Promise.resolve(undefined);
        }

        const row = world.settings.find((entry) => entry.practiceId === practiceId);

        if (row === undefined) {
          return Promise.resolve(undefined);
        }

        // Projected to exactly the nine granted columns, defaults filled the way the column
        // defaults of `02` §6.4 would. A spec that stored only the conditional three still gets
        // a complete, definite row here rather than `undefined` members.
        const complete = settingsRow(row.practiceId, row);

        return Promise.resolve({
          practiceId: complete.practiceId,
          billingReviewRequired: complete.billingReviewRequired === true,
          allowMpaApproval: complete.allowMpaApproval,
          allowBillingSpecialistApproval: complete.allowBillingSpecialistApproval,
          requireReasonForManualChange: complete.requireReasonForManualChange === true,
          aiEnabled: complete.aiEnabled === true,
          axenitaExportEnabled: complete.axenitaExportEnabled === true,
          retentionPolicyCode: complete.retentionPolicyCode ?? null,
          version: complete.version ?? 1,
        });
      },
      updatePracticeSettings: async (
        update: PracticeSettingsUpdate,
      ): Promise<PracticeSettingsRow | undefined> => {
        // Recorded with the FULL shape of the statement, because that is what the write specs are
        // about: which practice, which expected version, and which columns the `SET` list names,
        // in the order the application built them. A recorder that logged only the method name
        // could not tell "one field was assigned" from "all seven were", and could not prove that
        // an omitted field produced NO assignment at all.
        const assigned = update.assignments
          .map((assignment) => `${assignment.field}=${JSON.stringify(assignment.value)}`)
          .join(',');

        calls.push(
          `update settings(${update.practiceId},v=${String(update.expectedVersion)},[${assigned}])`,
        );

        // The `02` §17.1 tenant predicate, applied exactly as it is to the two read statements:
        // without `app.practice_id` the policy predicate is `practice_id = NULL` and the statement
        // matches NOTHING, so a write attempted before `set_request_context` is zero rows here
        // just as it would be in the database. The explicit practice predicate of the real
        // statement is the second barrier and is applied on top.
        if (appPracticeId === undefined || update.practiceId !== appPracticeId) {
          return Promise.resolve(undefined);
        }

        const index = world.settings.findIndex((entry) => entry.practiceId === update.practiceId);
        const stored = world.settings[index];

        if (stored === undefined) {
          // A missing row is ZERO ROWS, exactly like a stale version, and the double must not
          // distinguish them either — the whole point of D-055 clauses 19 to 21 is that nothing
          // downstream can.
          return Promise.resolve(undefined);
        }

        const current = settingsRow(stored.practiceId, stored);
        const currentVersion = current.version ?? 1;

        // THE OPTIMISTIC PREDICATE. A mismatch matches no row and returns `undefined`; it does
        // NOT throw, and it does not mutate. This is the modelled half of `409`.
        if (currentVersion !== update.expectedVersion) {
          return Promise.resolve(undefined);
        }

        // Only the SUBMITTED fields are applied, one by one, through an EXHAUSTIVE switch over
        // the same closed union the real adapter switches on. A dynamic `row[field] = value`
        // would model the write as "assign whatever key came in", which is precisely the shape
        // the union exists to make unexpressible — and it would let a spec pass against an
        // assignment the production `switch` could not compile.
        let next: SettingsRow = { ...current, version: currentVersion + 1 };

        for (const assignment of update.assignments) {
          switch (assignment.field) {
            case 'billingReviewRequired':
              next = { ...next, billingReviewRequired: assignment.value };
              break;
            case 'allowMpaApproval':
              next = { ...next, allowMpaApproval: assignment.value };
              break;
            case 'allowBillingSpecialistApproval':
              next = { ...next, allowBillingSpecialistApproval: assignment.value };
              break;
            case 'requireReasonForManualChange':
              next = { ...next, requireReasonForManualChange: assignment.value };
              break;
            case 'aiEnabled':
              next = { ...next, aiEnabled: assignment.value };
              break;
            case 'axenitaExportEnabled':
              next = { ...next, axenitaExportEnabled: assignment.value };
              break;
            case 'retentionPolicyCode':
              next = { ...next, retentionPolicyCode: assignment.value };
              break;
          }
        }

        world.settings[index] = next;

        // Projected to exactly the nine granted columns the real `RETURNING` names. `updated_at`
        // is absent here as it is there: the column is writable and NOT readable, so a double
        // that returned it would let a spec pass against a statement the database would refuse.
        return Promise.resolve({
          practiceId: next.practiceId,
          billingReviewRequired: next.billingReviewRequired === true,
          allowMpaApproval: next.allowMpaApproval,
          allowBillingSpecialistApproval: next.allowBillingSpecialistApproval,
          requireReasonForManualChange: next.requireReasonForManualChange === true,
          aiEnabled: next.aiEnabled === true,
          axenitaExportEnabled: next.axenitaExportEnabled === true,
          retentionPolicyCode: next.retentionPolicyCode ?? null,
          version: next.version ?? 1,
        });
      },
      findCurrentPlatformRoles: async (userId: string): Promise<readonly PlatformRoleRow[]> => {
        calls.push(`select platform_roles(${userId})`);
        return Promise.resolve(world.platformRoles.filter((row) => row.userId === userId));
      },
      runTenantStatement: async <TRow>(statement: TenantStatement): Promise<readonly TRow[]> => {
        // THE SMALL_ADAPTER SEAM, MODELLED IN THE SAME ONE ORDERED LOG AS EVERY IDENTITY
        // STATEMENT. That is the whole point of extending this harness rather than building a
        // second one (`08` §12.10 point 2): a behavioural spec can assert that the feature
        // statement ran on THIS session, in THIS transaction, AFTER `set_request_context`, and
        // exactly once.
        //
        // The recorded name is the adapter's own source-code `label`, never its SQL and never a
        // bound value, so nothing a caller supplies can reach the log.
        calls.push(`tenant_statement(${statement.label})`);

        // EVERY `P5-I4C` STATEMENT IS MODELLED IN THIS SAME ONE ORDERED LOG, on this same
        // session, under the same modelled GUCs. That is what lets the behavioural proof assert
        // that the advisory lock, the claim, the business insert, the audit insert and the
        // completion all ran inside ONE admitted pinned transaction, in the canonical order of
        // `04` §7.5a.3, and that a replay ran the read instead of the insert.
        //
        // Each branch reads `statement.sql.values` in the order the PRODUCTION statement binds
        // them, exactly as the read branch does: a statement that stopped binding its tenant
        // predicate would stop matching here too, rather than silently keep passing.
        if (statement.label !== PATIENT_REFERENCE_READ_STATEMENT) {
          return runPhase5Statement<TRow>(statement, world, appPracticeId);
        }

        // The parameters the PRODUCTION statement actually binds, in the order it binds them:
        // the admitted practice first, the resource second. Reading them here rather than
        // accepting them as arguments is what makes the double filter on the same values the
        // real statement filters on — a statement that stopped binding the tenant predicate
        // would stop matching here too.
        const [boundPracticeId, boundResourceId] = statement.sql.values;

        // `patient_references_select` (`013_rls_policies_phase5`), the PRIMARY control:
        // `practice_id = nullif(current_setting('app.practice_id', true), '')::uuid`. Without an
        // established tenant context the predicate is `practice_id = NULL` and NO row is visible
        // at all, for any practice — fail closed, exactly as in the database.
        //
        // The explicit `practice_id` term of the statement is applied on top, as the second
        // barrier D-073 requires the application to keep.
        const rows = world.patientReferences.filter(
          (row) =>
            appPracticeId !== undefined &&
            row.practiceId === appPracticeId &&
            row.practiceId === boundPracticeId &&
            row.id === boundResourceId,
        );

        // Projected to EXACTLY the six columns the real statement names. The stored row also
        // carries `practiceId`, and it must not travel: a double that returned the whole stored
        // object would let an over-projecting production statement pass here (M-1).
        const projected: readonly PatientReferenceRow[] = rows.map((row): PatientReferenceRow => ({
          id: row.id,
          pseudonym: row.pseudonym,
          birthYear: row.birthYear,
          sexCode: row.sexCode,
          sourceSystem: row.sourceSystem,
          createdAt: row.createdAt,
        }));

        // The seam is generic because it names no table; this double models exactly one
        // statement, so the row type is pinned above and widened here, once, at the boundary.
        return Promise.resolve(projected as readonly unknown[] as readonly TRow[]);
      },
    };
  }
}

/**
 * The `P5-I4C` half of the SMALL_ADAPTER seam — the eight statements the write path issues.
 *
 * IT MODELS THE POLICIES, NOT JUST THE TABLES. Every branch fails closed without an established
 * `app.practice_id`, exactly as `patient_references_*`, `idempotency_keys_*` and
 * `audit_events_insert` do under `FORCE ROW LEVEL SECURITY`: the reads see nothing and the writes
 * are refused. Without that, a unit spec could not observe an ordering defect at all — a
 * statement issued before `set_request_context` would look perfectly fine here while returning
 * zero rows against a real database.
 *
 * IT IS NOT A SECOND DB TEST SEAM. It is the SAME harness the `P5-I4A` behavioural proof already
 * uses, extended; a parallel double would be free to drift from this one and from the real
 * adapter, which is precisely the failure mode these specs exist to prevent. Real PostgreSQL
 * semantics — genuine advisory-lock contention between two connections, real `23505` mapping,
 * real `FORCE RLS`, the real HTTP surface and the stored-row audit reproduction — are proven
 * against a real database in `test/phase5-patient-reference-create.security.ts`. Both halves are
 * required; neither replaces the other.
 */
function runPhase5Statement<TRow>(
  statement: TenantStatement,
  world: World,
  appPracticeId: string | undefined,
): Promise<readonly TRow[]> {
  const values = statement.sql.values;
  const rows = (result: readonly unknown[]): Promise<readonly TRow[]> =>
    Promise.resolve(result as readonly TRow[]);

  switch (statement.label) {
    case IDEMPOTENCY_ADVISORY_LOCK_STATEMENT: {
      // `pg_try_advisory_xact_lock(<key>::bigint)` — ONE bound value, the decimal `int64`.
      //
      // NON-BLOCKING is the property under test, so the double NEVER waits: a key another
      // transaction holds returns `false` immediately, which is the whole difference between
      // `pg_try_advisory_xact_lock` and its blocking sibling.
      const [lockKey] = values;

      return rows([{ acquired: !world.heldAdvisoryLocks.includes(String(lockKey)) }]);
    }

    case IDEMPOTENCY_CLAIM_READ_STATEMENT: {
      // The FOUR scope columns, in the order the statement binds them (`02` §15.2).
      const [practiceId, userId, endpoint, idempotencyKey] = values;

      const claim = world.idempotencyKeys.find(
        (row) =>
          appPracticeId !== undefined &&
          row.practiceId === appPracticeId &&
          row.practiceId === practiceId &&
          row.userId === userId &&
          row.endpoint === endpoint &&
          row.idempotencyKey === idempotencyKey,
      );

      if (claim === undefined) {
        return rows([]);
      }

      // Projected to EXACTLY the four columns the real statement names. The store holds the whole
      // row, and it must not travel: a double that returned everything would let an
      // over-projecting production statement pass.
      return rows([
        {
          id: claim.id,
          requestSha256: claim.requestSha256,
          responseStatus: claim.responseStatus,
          responseBody: claim.responseBody,
          completedAt: claim.completedAt,
        },
      ]);
    }

    case IDEMPOTENCY_CLAIM_INSERT_STATEMENT: {
      const [id, practiceId, userId, idempotencyKey, endpoint, requestSha256, lockedAt, expiresAt] =
        values;

      // `idempotency_keys_insert` — `WITH CHECK (practice_id = app.practice_id)`. Without a
      // context the predicate is `practice_id = NULL` and the write is refused.
      if (appPracticeId === undefined || practiceId !== appPracticeId) {
        throw new Error('idempotency_keys_insert refused the row (no matching tenant context).');
      }

      world.idempotencyKeys.push({
        id: String(id),
        practiceId: String(practiceId),
        userId: String(userId),
        endpoint: String(endpoint),
        idempotencyKey: String(idempotencyKey),
        requestSha256: String(requestSha256),
        // The claim carries NO cached answer: the statement does not name either column, so a
        // freshly claimed row cannot already look completed.
        responseStatus: null,
        responseBody: null,
        lockedAt: lockedAt as Date,
        completedAt: null,
        expiresAt: expiresAt as Date,
      });

      return rows([{ id }]);
    }

    case IDEMPOTENCY_COMPLETION_UPDATE_STATEMENT: {
      const [responseStatus, resourceId, completedAt, id, practiceId] = values;

      const index = world.idempotencyKeys.findIndex(
        (row) =>
          appPracticeId !== undefined &&
          row.practiceId === appPracticeId &&
          row.id === id &&
          row.practiceId === practiceId,
      );
      const stored = world.idempotencyKeys[index];

      if (stored === undefined) {
        return rows([]);
      }

      // Exactly the FOUR granted mutable columns (`02` §29.4a.3). Everything else is copied
      // forward unchanged, so a spec can assert that the scope, the digest and `expires_at`
      // survived the completion untouched — a production statement that tried to move one would
      // be refused on privilege AND on policy anyway.
      world.idempotencyKeys[index] = {
        ...stored,
        responseStatus: responseStatus as number,
        // `jsonb_build_object('resourceId', <uuid>)` — the MINIMAL cache, and the only shape the
        // statement can produce.
        responseBody: { resourceId: String(resourceId) },
        completedAt: completedAt as Date,
        lockedAt: null,
      };

      return rows([{ id }]);
    }

    case PATIENT_REFERENCE_INSERT_STATEMENT: {
      const [
        id,
        practiceId,
        sourceSystem,
        externalPatientRefHash,
        pseudonym,
        birthYear,
        sexCode,
        createdAt,
      ] = values;

      if (appPracticeId === undefined || practiceId !== appPracticeId) {
        throw new Error('patient_references_insert refused the row (no matching tenant context).');
      }

      // THE CONFLICT TARGET IS CHECKED FIRST, and that ordering is the database's, not a
      // convenience: `ON CONFLICT ("practice_id","pseudonym") DO NOTHING` SKIPS the row on a
      // pseudonym collision, so no other constraint is evaluated at all and no error is raised.
      const pseudonymTaken = world.patientReferences.some(
        (row) => row.practiceId === practiceId && row.pseudonym === pseudonym,
      );

      if (pseudonymTaken) {
        return rows([]);
      }

      // `patient_references_source_external_ref_key` —
      // `unique (practice_id, source_system, external_patient_ref_hash)`. It is NOT the conflict
      // target, so it RAISES, and the adapter translates that one violation into a type.
      const externalReferenceTaken = world.patientReferences.some(
        (row) =>
          row.practiceId === practiceId &&
          row.sourceSystem === sourceSystem &&
          row.externalPatientRefHash === externalPatientRefHash,
      );

      if (externalReferenceTaken) {
        throw new DuplicateExternalReferenceError();
      }

      const inserted: OwnedPatientReference = {
        id: String(id),
        practiceId: String(practiceId),
        pseudonym: String(pseudonym),
        birthYear: birthYear as number | null,
        sexCode: sexCode as string | null,
        sourceSystem: String(sourceSystem),
        createdAt: createdAt as Date,
        externalPatientRefHash: String(externalPatientRefHash),
      };

      world.patientReferences.push(inserted);

      // The RETURNING list is EXACTLY the six public columns — the same six the read projects, so
      // `201` and `200` are built from identical material. `external_patient_ref_hash` is stored
      // and deliberately not returned.
      return rows([
        {
          id: inserted.id,
          pseudonym: inserted.pseudonym,
          birthYear: inserted.birthYear,
          sexCode: inserted.sexCode,
          sourceSystem: inserted.sourceSystem,
          createdAt: inserted.createdAt,
        },
      ]);
    }

    case PATIENT_REFERENCE_PSEUDONYM_LOOKUP_STATEMENT: {
      const [practiceId, pseudonym] = values;

      // PLAIN EQUALITY, exactly as the statement applies it: no case folding here either, so a
      // production statement that dropped the uppercase canonicalisation upstream would fail
      // here rather than be rescued by a lenient double.
      return rows(
        projectPublicColumns(
          world,
          practiceId,
          appPracticeId,
          (row) => row.pseudonym === pseudonym,
        ),
      );
    }

    case PATIENT_REFERENCE_EXTERNAL_REFERENCE_LOOKUP_STATEMENT: {
      const [practiceId, sourceSystem, externalPatientRefHash] = values;

      return rows(
        projectPublicColumns(
          world,
          practiceId,
          appPracticeId,
          (row) =>
            row.sourceSystem === sourceSystem &&
            row.externalPatientRefHash === externalPatientRefHash,
        ),
      );
    }

    case AUDIT_EVENT_INSERT_STATEMENT: {
      const [
        id,
        practiceId,
        occurredAt,
        actorType,
        actorUserId,
        action,
        resourceType,
        resourceId,
        requestId,
        metadata,
        eventSha256,
      ] = values;

      if (appPracticeId === undefined || practiceId !== appPracticeId) {
        throw new Error('audit_events_insert refused the row (no matching tenant context).');
      }

      // ALL SEVENTEEN columns are stored, with the six the statement writes as SQL `NULL` held as
      // `null` here. `metadata` is stored as the PARSED value, because the column is `jsonb` and
      // the statement casts the bound string with `::jsonb` — so a spec reproducing the hash
      // payload from this row works with a JSON value, exactly as `04` §7.5a.3 requires.
      world.auditEvents.push({
        id: String(id),
        practiceId: String(practiceId),
        occurredAt: occurredAt as Date,
        actorType: String(actorType),
        actorUserId: String(actorUserId),
        actorService: null,
        action: String(action),
        resourceType: String(resourceType),
        resourceId: String(resourceId),
        requestId: typeof requestId === 'string' ? requestId : null,
        sessionIdHash: null,
        ipAddress: null,
        userAgentHash: null,
        previousValue: null,
        newValue: null,
        metadata: JSON.parse(String(metadata)) as unknown,
        eventSha256: String(eventSha256),
        previousEventSha256: null,
      });

      return rows([{ id }]);
    }

    default:
      // A statement this double does not model must FAIL rather than quietly return no rows: an
      // unmodelled read that looked like "not found" would let a spec pass against a query
      // nobody had reviewed.
      throw new Error(`Unmodelled tenant statement: ${statement.label}`);
  }
}

/**
 * The six public columns of every `patient_references` row matching a predicate, under the tenant
 * policy AND the statement's own explicit predicate.
 *
 * Shared by the two service-level lookups so that neither can accidentally project a seventh
 * column or forget a barrier.
 */
function projectPublicColumns(
  world: World,
  boundPracticeId: unknown,
  appPracticeId: string | undefined,
  matches: (row: OwnedPatientReference) => boolean,
): readonly PatientReferenceRow[] {
  return world.patientReferences
    .filter(
      (row) =>
        appPracticeId !== undefined &&
        row.practiceId === appPracticeId &&
        row.practiceId === boundPracticeId &&
        matches(row),
    )
    .map((row): PatientReferenceRow => ({
      id: row.id,
      pseudonym: row.pseudonym,
      birthYear: row.birthYear,
      sexCode: row.sexCode,
      sourceSystem: row.sourceSystem,
      createdAt: row.createdAt,
    }));
}
