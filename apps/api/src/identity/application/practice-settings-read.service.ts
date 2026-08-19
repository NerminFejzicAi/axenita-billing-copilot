/**
 * `GET /api/v1/practices/{practiceId}/settings` — the authorised read of the current tenant
 * practice's settings.
 *
 * Normative sources: `03` §3.2, §3.4 and §3.7.1; `03` §28.5 (permission derivation); `04` §5.2;
 * `15` §5; `02` §17.1 and §20.2b.1; D-044 and D-049 (the permission stays `PRACTICE_ADMIN` only);
 * D-047 clauses 8, 10, 11 and 18; D-053 parts A and C; D-054 clause 12.
 *
 * THE FIRST ADDITIONAL TENANT ROUTE AFTER D-054
 *
 * This service exists to be the proof that the tenant half of an authenticated request is a
 * SHARED STAGE and not a pattern each route re-implements. It reproduces none of it. Everything
 * between admission and the business read — the header, the path/header match, the requested
 * practice, its status, the ACTIVE membership, `set_request_context`, the roles, the conditional
 * settings and the permission decision — belongs to {@link TenantRequestPipeline}, exactly as it
 * does for `GET /practices/{practiceId}`. The two routes differ in TWO values and in nothing
 * else: which permission they require, and what they read at step 11.
 *
 *     BEGIN                                        (D-047 clause 8)
 *       set_auth_subject_context(subject)          \
 *       bootstrap users read, exactly one row       |  IdentityBootstrapService
 *       users.status = ACTIVE                       |  (03 §3.7.1 steps 1-2)
 *       set_user_context(users.id)                 /
 *       read + validate X-Practice-ID              \
 *       path practiceId == practice context         |
 *       membership-scoped read of the practice      |
 *       0 rows / status <> ACTIVE -> 403, ROLLBACK  |  TenantRequestPipeline
 *       ACTIVE membership of THIS user             /   (03 §3.7.1 steps 3-10,
 *       absent or inactive        -> 403, ROLLBACK  |   D-047 clauses 10, 11 and 18,
 *       set_request_context(requested practice)     |   D-053 clause C.3)
 *         ACTIVE membership re-validated in the DB  |
 *         app.practice_id now exists                |
 *       roles of that membership, settings of that  |
 *       practice, effective permission set          |
 *       practice.settings.read not held -> 403     /
 *       the settings row, read under tenant RLS        <-- step 11, below
 *       projection of exactly eight fields + ETag
 *     COMMIT
 *
 * NO SECOND IDENTITY ENTERS HERE (D-054 clause 12)
 *
 * The service accepts a verified auth SUBJECT and two untrusted request values. It accepts no
 * `userId`, passes none, and has nothing to pass one to: `TenantRequestPipeline.admit` takes a
 * session and a request, and the session's `app.user_id` is the only identity on the path. This
 * route therefore cannot express "read practice P's settings as user U2" — not by mistake, and
 * not on purpose. No membership is looked up here at all.
 *
 * NO GRANT IS RESTATED HERE
 *
 * The service names the permission the endpoint REQUIRES; the pipeline derives whether the caller
 * holds it through the single application representation of the `15` matrix. There is no
 * `role === 'PRACTICE_ADMIN'` anywhere in this file and there must never be one, even though the
 * matrix currently grants `practice.settings.read` to that role alone: the matrix is the oracle,
 * and a hard-coded role check would silently survive a change to it.
 *
 * NO WRITE BEHAVIOUR
 *
 * `PATCH /practices/{practiceId}/settings` is a later slice. This file contains no `If-Match`
 * handling, no `428`, no `409`, no version comparison, no `UPDATE` and no idempotency key
 * (D-053 clause B.4). It reads `version` for exactly one purpose — the `ETag` of clause A.2.
 */

import { Injectable } from '@nestjs/common';

import { type Permission, type PracticeSettingsResponseDto } from '@axenita/contracts';

import { IdentityInvariantError } from '../identity.errors.js';
import {
  type IdentityBootstrapSession,
  type PracticeSettingsRow,
} from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';
import { TenantRequestPipeline } from './tenant-request.pipeline.js';

/**
 * The permission this endpoint requires (`03` §"GET /practices/{practiceId}/settings", `15` §5,
 * D-044, D-049).
 *
 * Typed as {@link Permission}, so a typo is a compile error rather than a permission that is
 * silently never granted. This names WHICH permission the route asks for; it says nothing about
 * which role holds it, which is the matrix's business alone.
 */
const REQUIRED_PERMISSION: Permission = 'practice.settings.read';

/** Everything one request supplies. All three inputs are narrowed against each other. */
export interface PracticeSettingsReadRequest {
  /** The subject of an already verified bearer credential (never a body, query or header). */
  readonly verifiedAuthSubject: string;
  /** The raw `{practiceId}` path segment, exactly as received. */
  readonly requestedPracticeId: string;
  /** The raw `X-Practice-ID` value, or `undefined` when the client sent none. */
  readonly practiceContextHeader: string | undefined;
}

/**
 * One authorised settings read: the frozen document plus the header value that carries its
 * version.
 *
 * The two travel together and are produced together, from ONE row of ONE statement, so the `ETag`
 * a client receives cannot describe a different read than the body it accompanies. The controller
 * receives the finished header VALUE rather than the number, so no layer above this one has to
 * know how a version becomes an entity tag.
 */
export interface PracticeSettingsReadResult {
  /** Exactly the eight fields of D-053 clause A.1. */
  readonly settings: PracticeSettingsResponseDto;
  /** The strong entity tag of D-053 clause A.2, quoted and ready to send verbatim. */
  readonly etag: string;
}

@Injectable()
export class PracticeSettingsReadService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
  ) {}

  /**
   * Resolves the caller, admits the tenant request and projects the practice settings.
   *
   * Returns only for a caller who is an `ACTIVE` user, holds an ACTIVE membership in the
   * requested `ACTIVE` practice, and whose roles in THAT membership derive
   * `practice.settings.read`. Every other outcome throws.
   */
  public async loadSettings(
    request: PracticeSettingsReadRequest,
  ): Promise<PracticeSettingsReadResult> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session) => {
        // Steps 3 to 10. Returns only for an admitted request, and only with
        // `app.practice_id` established for the remainder of this transaction.
        //
        // The admitted user is NOT passed, because there is no parameter for one. The pipeline
        // derives the membership from the `app.user_id` this session established, so this route
        // cannot name an identity even by mistake (D-054 clause 12).
        const admitted = await this.tenantRequests.admit(session, {
          requestedPracticeId: request.requestedPracticeId,
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        const settings = await this.readAdmittedSettings(session, admitted.practiceId);

        return Object.freeze({
          settings: project(settings),
          etag: entityTagOf(settings.version),
        });
      },
    );
  }

  /**
   * Step 11 — the business read, strictly under the established tenant context.
   *
   * `practiceId` is the admitted practice and therefore the value now in `app.practice_id`, so
   * the `02` §17.1 tenant policy and the explicit predicate agree by construction; the statement
   * could not return another tenant's settings even if they did not. Reaching this method before
   * the pipeline had run would not leak a foreign row either — it would return NONE, because the
   * policy's predicate would be `practice_id = NULL` — but the call order is what makes the
   * question moot, and it is fixed by the single caller above.
   *
   * A MISSING ROW IS AN INTERNAL INVARIANT FAILURE, NOT AN AUTHORISATION OUTCOME.
   *
   * By the time this runs, the caller has been authenticated, the practice has been admitted and
   * proven `ACTIVE`, the membership has been proven ACTIVE twice, the tenant context has been
   * established, and `practice.settings.read` has been derived and held. Every practice is
   * required to carry exactly one `practice_settings` row — `practice_id` is `NOT NULL` and
   * `UNIQUE`, and the row is written by the trusted seed path (`02` §6.4, §23.4). Zero rows here
   * therefore means the DATABASE is inconsistent, not that the caller asked for something they
   * may not have.
   *
   * Answering `403` would be a lie that also corrupts the anti-enumeration contract: the shared
   * refusal is supposed to mean "you may not know", and it would come to mean "and sometimes we
   * are broken". Answering `404` would newly disclose that the practice exists but has no
   * settings. Fabricating defaults, an empty document or a repaired row would be worse than
   * either — an approval-configuration document invented by the API and presented as this
   * practice's real settings.
   *
   * The failure is therefore raised as {@link IdentityInvariantError}. It is not an
   * `ApiException`, so the single Problem Details filter renders the generic
   * `500 INTERNAL_ERROR` with its own static detail, and logs a static line with no exception
   * text (`09` §11). The message below is server-side only and never reaches a response: it names
   * no practice, no membership, no user, no table, no column and no statement, so it stays
   * non-sensitive even in a log that captured it.
   *
   * NOTHING IS CREATED OR REPAIRED HERE. There is no `INSERT` grant on `practice_settings` for
   * any runtime role in phase 4 either (D-053 clause B.2, `02` §20.2b.1), so a write-behind
   * "fix" is not merely forbidden by this comment — it is unexpressible.
   */
  private async readAdmittedSettings(
    session: IdentityBootstrapSession,
    practiceId: string,
  ): Promise<PracticeSettingsRow> {
    const settings = await session.findPracticeSettings(practiceId);

    if (settings === undefined) {
      throw new IdentityInvariantError(
        'An admitted practice carries no practice_settings row. Exactly one row per practice is ' +
          'a schema invariant, so the settings representation cannot be produced.',
      );
    }

    return settings;
  }
}

/**
 * The strong entity tag of D-053 clause A.2 — the row's integer `version`, quoted.
 *
 * STRONG, AND SET BY THE APPLICATION. `W/"3"` is not this value: a weak tag asserts only
 * semantic equivalence, while `version` is the exact token the optimistic-locking contract of
 * `03` §5.2 compares an `If-Match` against, and a later `PATCH` slice must be able to treat a
 * returned tag as an exact version. Express would otherwise generate a WEAK, CONTENT-HASHED tag
 * of its own for this response — a tag that changes when the rendering changes and stays equal
 * when only `version` moved, which is precisely the wrong equality. The canonical tag is
 * therefore always set explicitly, and Express leaves an already-set `ETag` alone.
 *
 * `version` is an `integer` column (`02` §6.4), so the rendering is exact and needs no escaping:
 * the tag can only ever be a quoted run of digits.
 */
function entityTagOf(version: number): string {
  return `"${String(version)}"`;
}

/**
 * The accepted response projection — exactly eight fields, written out one by one.
 *
 * The row is never spread and never returned as-is. Building the document member by member is
 * what guarantees that a future widening of the database projection, of a column grant or of the
 * Prisma model cannot add a field to the HTTP response by accident.
 *
 * `version` IS DELIBERATELY NOT COPIED. It is present on the row — it is the ninth granted column
 * and this route reads it on purpose — and it stops here, at the one place where a row becomes a
 * document. D-053 clause A.2 allows exactly one channel for the current version, and that channel
 * is the `ETag`. A spread would have published it silently; this projection cannot.
 */
function project(settings: PracticeSettingsRow): PracticeSettingsResponseDto {
  return {
    practiceId: settings.practiceId,
    billingReviewRequired: settings.billingReviewRequired,
    allowMpaApproval: settings.allowMpaApproval,
    allowBillingSpecialistApproval: settings.allowBillingSpecialistApproval,
    requireReasonForManualChange: settings.requireReasonForManualChange,
    aiEnabled: settings.aiEnabled,
    axenitaExportEnabled: settings.axenitaExportEnabled,
    retentionPolicyCode: settings.retentionPolicyCode,
  };
}
