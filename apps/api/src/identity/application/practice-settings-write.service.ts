/**
 * `PATCH /api/v1/practices/{practiceId}/settings` — the authorised, optimistically concurrent
 * write of the current tenant practice's settings.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1, §5.2, §9 and §28.5; `02` §6.4, §17.1 and §20.2b.1;
 * `15` §5; D-028 clause 2; D-044; D-047 clauses 8, 10, 11 and 18; D-053 parts A and B; D-054
 * clause 12; D-055 parts D, E, F, G, H, J and K. Owner ratifications R1 and R2 of gate P4-5D.
 *
 * A SEPARATE SERVICE FROM THE READ, DELIBERATELY
 *
 * `PracticeSettingsReadService` is untouched by this slice and gains no write semantics. The two
 * routes share the tenant pipeline, the bootstrap and the representation — by USING them, not by
 * merging — and they differ in everything a write actually is: a different required permission,
 * a mandatory precondition header, a request body, a validation stage that may not run before
 * authorisation, and a statement that mutates. Folding both into one class would put a write path
 * behind a name that says "read" and would make the read route's frozen behaviour a function of
 * changes made for the write.
 *
 * THE COMPLETE ORDER, AND WHY EVERY BOUNDARY IS WHERE IT IS
 *
 *     BEGIN                                              (D-047 clause 8 — ONE transaction)
 *   1   bearer verified                                  DevelopmentAuthGuard
 *   2   set_auth_subject_context / users / ACTIVE /      IdentityBootstrapService
 *       set_user_context                                 (03 §3.7.1 steps 1-2)
 *   3   X-Practice-ID read + validated                  \
 *       path practiceId == practice context               |
 *   4   membership-scoped read of the practice, ACTIVE    |
 *       ACTIVE membership of THIS user                    |  TenantRequestPipeline
 *   5   set_request_context(requested practice)           |  (steps 3-10, unchanged, shared)
 *   6-9 roles, conditional settings, effective set        |
 *  10   practice.settings.manage held                    /
 *       ---- everything below is reachable ONLY by a fully authorised caller ----
 *  11a  If-Match parsed                428 / 400
 *  11b  body root shape                400 (empty-patch path)
 *  11c  body schema validated          422
 *  11d  at least one submitted field   400 (empty-patch path)
 *  11e  ONE atomic UPDATE ... RETURNING
 *  11f  zero rows                      409
 *  11g  eight-field projection + new strong ETag
 *     COMMIT
 *
 * THE BODY SCHEMA IS NOT EVALUATED BEFORE AUTHORISATION, AND THAT IS A SECURITY PROPERTY.
 * `03` §3.7.1 fixes the order and forbids reordering it. A caller who is unknown, inactive, not a
 * member, a member of an inactive practice or simply not permitted must receive the canonical
 * admission refusal and NOTHING ELSE — in particular no `errors[]` list naming the fields of a
 * resource they may not touch. A field-level `422` is a description of an internal contract, and
 * describing it to an unauthorised caller is disclosure. This is also why the controller carries
 * no `@Body()` parameter: a global Nest parameter pipe necessarily runs BEFORE the controller
 * method body, and therefore before this transaction exists at all.
 *
 * IF-MATCH COMES BEFORE THE BODY (owner-accepted precedence). For an authorised caller:
 *
 *     missing  If-Match + malformed body -> 428
 *     malformed If-Match + malformed body -> 400
 *     valid    If-Match + malformed body -> 422
 *     missing  If-Match + {}             -> 428
 *     malformed If-Match + {}            -> 400
 *     valid    If-Match + {}             -> 400 (empty patch)
 *
 * The precondition is a statement about WHICH VERSION the caller intends to write, and it is
 * cheaper and more fundamental than the payload: a request that does not say which version it
 * targets cannot be applied whatever its body contains.
 *
 * NO SECOND IDENTITY, NO SECOND PIPELINE, NO SECOND TRANSACTION (D-054 clause 12, D-055
 * clause 29). The service accepts a verified auth SUBJECT and four untrusted request values. It
 * accepts no `userId` and has nothing to pass one to. There is exactly one
 * `runAuthenticatedSession` and exactly one `TenantRequestPipeline.admit` on this path, and no
 * hard-coded `PRACTICE_ADMIN` check anywhere in this file — the matrix is the oracle.
 *
 * NO IDEMPOTENCY KEY (D-055 clause 31) and NO `If-None-Match` HANDLING (clause 24). `If-Match` is
 * the only concurrency channel this route has, and an `If-None-Match` sent to it is simply not
 * read here — it neither substitutes for `If-Match` nor changes any outcome.
 */

import { Injectable, ValidationPipe } from '@nestjs/common';

import { type Permission, type PracticeSettingsResponseDto } from '@axenita/contracts';

import { API_VALIDATION_PIPE_OPTIONS } from '../../common/validation/validation-pipe-options.js';
import { PracticeSettingsPatchDto } from '../dto/practice-settings-patch.dto.js';
import { IdentityInvariantError, patchBodyEmpty, versionConflict } from '../identity.errors.js';
import {
  type PracticeSettingsAssignment,
  type PracticeSettingsAssignments,
  type PracticeSettingsRow,
} from '../infrastructure/identity-database.port.js';
import { IdentityBootstrapService } from './identity-bootstrap.service.js';
import { parseIfMatchVersion } from './practice-settings-if-match.js';
import { entityTagOf, projectPracticeSettings } from './practice-settings-representation.js';
import { TenantRequestPipeline } from './tenant-request.pipeline.js';

/**
 * The permission this endpoint requires (`03` §5.2, `15` §5, D-044, D-055 clause 28).
 *
 * `practice.settings.manage`, NOT `practice.settings.read`: reading and writing this resource are
 * separate cells of the matrix and the write route must not inherit the read route's answer.
 * Typed as {@link Permission}, so a typo is a compile error rather than a permission that is
 * silently never granted. This names WHICH permission the route asks for and says nothing about
 * which role holds it — that is the matrix's business alone, and there is no `role ===
 * 'PRACTICE_ADMIN'` in this file.
 */
const REQUIRED_PERMISSION: Permission = 'practice.settings.manage';

/**
 * The six mutable BOOLEAN fields of D-053 clause B.1, frozen in one place.
 *
 * This list is the presence oracle. It is deliberately a literal tuple rather than something
 * derived from the DTO class at runtime: `Object.keys` of a class instance answers a question
 * about `class-transformer`, not about the accepted contract.
 */
const MUTABLE_BOOLEAN_FIELDS = [
  'billingReviewRequired',
  'allowMpaApproval',
  'allowBillingSpecialistApproval',
  'requireReasonForManualChange',
  'aiEnabled',
  'axenitaExportEnabled',
] as const;

/** The one mutable field that is a nullable string. */
const RETENTION_POLICY_CODE = 'retentionPolicyCode';

/**
 * The delayed body validator — the SAME configuration as the global pipe, built from the SAME
 * frozen constant (see `validation-pipe-options.ts`).
 *
 * It is a module-level singleton because it is stateless: a `ValidationPipe` holds only its
 * options, so one instance serves every request and none of them can influence another.
 *
 * WHY A PIPE AT ALL, RATHER THAN A HAND-WRITTEN CHECK. The repository's request-validation
 * semantics — `whitelist`, the `UNKNOWN_FIELD` refusal, the `422` status, the stable field codes
 * and the `errors[]` document of `03` §8 — are a contract every route shares. Re-implementing
 * them here would produce a second dialect of "invalid request" that no existing test covers and
 * that would drift from the global one at the first change to either.
 */
const patchBodyValidator = new ValidationPipe(API_VALIDATION_PIPE_OPTIONS);

/** Everything one `PATCH` request supplies. Every member is untrusted until proven otherwise. */
export interface PracticeSettingsWriteRequest {
  /** The subject of an already verified bearer credential (never a body, query or header). */
  readonly verifiedAuthSubject: string;
  /** The raw `{practiceId}` path segment, exactly as received. */
  readonly requestedPracticeId: string;
  /** The raw `X-Practice-ID` value, or `undefined` when the client sent none. */
  readonly practiceContextHeader: string | undefined;
  /**
   * The raw `If-Match` value, or `undefined` when the client sent none.
   *
   * `undefined` and `''` are DIFFERENT facts here and must reach the parser as different values
   * (D-055 clauses 10 to 12): the first is a missing precondition (`428`), the second a malformed
   * one (`400`). Nothing on the way in may collapse them.
   */
  readonly ifMatchHeader: string | undefined;
  /**
   * The parsed JSON request body, exactly as the body parser produced it, with NO schema applied.
   *
   * Typed `unknown` on purpose. It is validated inside this service, after authorisation, and the
   * type is what stops any layer above from assuming a shape that has not been proven yet.
   */
  readonly body: unknown;
}

/**
 * One authorised settings write: the frozen document plus the header value carrying its NEW
 * version.
 *
 * Both are produced from ONE row of ONE statement (D-055 clause 23), so the `ETag` a client
 * receives cannot describe a different state than the body it accompanies. The controller
 * receives the finished header VALUE rather than the number, so no layer above this one has to
 * know how a version becomes an entity tag.
 */
export interface PracticeSettingsWriteResult {
  /** Exactly the eight fields of D-053 clause A.1 — the same representation `GET` returns. */
  readonly settings: PracticeSettingsResponseDto;
  /** The strong entity tag of the NEW version, quoted and ready to send verbatim. */
  readonly etag: string;
}

@Injectable()
export class PracticeSettingsWriteService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
  ) {}

  /**
   * Resolves the caller, admits the tenant request, and applies the submitted settings.
   *
   * Returns only for a caller who is an `ACTIVE` user, holds an ACTIVE membership in the
   * requested `ACTIVE` practice, whose roles in THAT membership derive
   * `practice.settings.manage`, who supplied an accepted `If-Match`, whose body carries at least
   * one valid mutable field, and whose asserted version matched the persisted one. Every other
   * outcome throws, which rolls the transaction back and discards every `app.*` setting with it.
   */
  public async updateSettings(
    request: PracticeSettingsWriteRequest,
  ): Promise<PracticeSettingsWriteResult> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session) => {
        // Steps 3 to 10, through the ONE shared pipeline. Returns only for an admitted and
        // authorised request, and only with `app.practice_id` established for the remainder of
        // this transaction.
        //
        // The admitted user is NOT passed, because there is no parameter for one. The pipeline
        // derives the membership from the `app.user_id` this session established, so this route
        // cannot name an identity even by mistake (D-054 clause 12).
        //
        // EVERY LINE BELOW THIS ONE IS REACHABLE ONLY BY A CALLER WHO HOLDS
        // `practice.settings.manage` IN THE ADMITTED PRACTICE.
        const admitted = await this.tenantRequests.admit(session, {
          // `PRACTICE_PATH`, stated explicitly (D-073, `OD-P5-I4A-1`:
          // `EXISTING_PRACTICE_ROUTES_TENANT_SCOPE = PRACTICE_PATH`). The path of this route
          // carries the practice identity, so the mandatory path segment travels inside the
          // variant that has one and is genuinely compared with the admitted header context.
          // Behaviour is UNCHANGED: a path/header mismatch remains `403 ACCESS_DENIED`.
          scope: { mode: 'PRACTICE_PATH', requestedPracticeId: request.requestedPracticeId },
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        // Step 11a — the precondition, before the payload. Throws `428` for an absent header and
        // `400` for every present-but-unaccepted one; `409` is not decided here.
        const expectedVersion = parseIfMatchVersion(request.ifMatchHeader);

        // Steps 11b to 11d — root shape, schema, and "at least one submitted field", in that
        // order. Returns a structurally non-empty assignment list or throws.
        const assignments = await buildAssignments(request.body);

        // Step 11e — the ONE atomic optimistic-concurrency statement (D-055 clause 15). No read
        // precedes it and none follows it.
        const updated = await session.updatePracticeSettings({
          // The ADMITTED practice, never the raw path segment. The two are equal by the time
          // this runs, but taking the admitted value is what makes that a fact of the code
          // rather than a fact about the caller's input.
          practiceId: admitted.practiceId,
          expectedVersion,
          assignments,
        });

        // Step 11f — zero rows, one answer (D-055 clauses 19 to 21).
        const row = requireUpdatedRow(updated);

        // Step 11g — both halves of the response from the SAME returned row (clause 23).
        return Object.freeze({
          settings: projectPracticeSettings(row),
          etag: entityTagOf(row.version),
        });
      },
    );
  }
}

/**
 * Zero rows becomes `409 VERSION_CONFLICT`, and no second statement asks why.
 *
 * THE SAME PUBLIC OUTCOME FOR THREE DIFFERENT INTERNAL CAUSES: the caller's version is stale, the
 * `practice_settings` row does not exist, or the row is invisible under the tenant policy. D-055
 * clause 19 gives all of them this answer and clause 20 forbids the discriminating read.
 *
 * The forbidden alternatives are worth naming, because each looks locally reasonable:
 *
 * - `404` would require a pre-read to know the row is missing, would newly disclose that an
 *   admitted practice has no settings, and would introduce the very race clause 16 removes;
 * - `403` would report an authorisation outcome for a caller who WAS authorised — every tenant
 *   barrier has already passed by the time this runs — and would dilute the anti-enumeration
 *   meaning of the shared refusal;
 * - a generic `500` would need the same pre-read merely to tell itself apart from a stale
 *   version, and would present a routine optimistic-locking miss as a broken server.
 *
 * Note the deliberate ASYMMETRY with `GET` (clause 21): a missing row discovered by READING is
 * `500 INTERNAL_ERROR` there, because a read has no other way to learn of it and the row is a
 * schema invariant. A write learns it for free, from the row count of the statement it had to
 * issue anyway, and paying for the distinction would cost the atomicity.
 */
function requireUpdatedRow(row: PracticeSettingsRow | undefined): PracticeSettingsRow {
  if (row === undefined) {
    throw versionConflict();
  }

  return row;
}

/**
 * Steps 11b to 11d — turns an untrusted parsed body into the assignments the statement will make.
 *
 * Three gates, in this order and for this reason:
 *
 * 1. ROOT SHAPE. Explicit, and not left to emerge from `class-transformer`'s handling of odd
 *    inputs. A body that is not a non-null, non-array object carries zero submitted mutable
 *    fields by definition, so it takes the empty-patch path to `400` (owner correction C2).
 * 2. SCHEMA. The delayed `ValidationPipe`, with the shared frozen options. This runs BEFORE the
 *    emptiness count on purpose: a body of nothing but unknown fields must be told it sent
 *    unknown fields (`422` + `UNKNOWN_FIELD`), not silently whitelisted down to `{}` and then
 *    reported as an empty patch. The two faults are different and the caller must be able to
 *    tell them apart.
 * 3. EMPTINESS. Counted over RAW own properties, after the schema passed (D-055 clause 14).
 */
async function buildAssignments(body: unknown): Promise<PracticeSettingsAssignments> {
  // Gate 1 — the explicit root-shape guard (owner correction C2).
  //
  // `undefined` covers a request whose body was never populated; `null` covers a literal JSON
  // `null` should it ever reach this layer; an ARRAY is rejected because `Object.hasOwn(['x'],
  // 'aiEnabled')` is `false` for every mutable field anyway, so an array is a body with zero
  // submitted fields — stating that here makes it a rule instead of a coincidence. Every one of
  // them takes the SAME empty-patch path, because "you did not ask for a change" is exactly what
  // they all mean.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw patchBodyEmpty();
  }

  // Gate 2 — the schema, with the SAME options as the global pipe. Throws the repository's
  // standard `422 VALIDATION_ERROR` document, with the stable field codes: `UNKNOWN_FIELD` for
  // an unmodelled member, `INVALID_BOOLEAN` for a non-boolean (including `null`),
  // `INVALID_STRING` for a non-string retention code and `INVALID_LENGTH` above 100 characters.
  //
  // The RESULT IS DELIBERATELY DISCARDED. It answers "is every submitted value acceptable?" and
  // that is all this call is for. It cannot answer "which fields were submitted?", because a
  // compiled class field and `class-transformer` may both materialise an omitted property as an
  // own property whose value is `undefined` — so reading the instance's keys would invent
  // assignments the caller never made, and reading its values would turn an omitted field into an
  // SQL `NULL`.
  await patchBodyValidator.transform(body, {
    type: 'body',
    metatype: PracticeSettingsPatchDto,
  });

  // Gate 3 — presence from the RAW parsed body, and from nothing else.
  //
  // `Object.hasOwn` is the whole rule. NOT truthiness: `false` is a submitted value and a
  // truthiness test would silently drop every `false` a caller sent, which on this resource means
  // silently ignoring "turn this control OFF". NOT the DTO's own keys, for the reason above. NOT
  // `value !== null` either: `retentionPolicyCode: null` is a submitted request for SQL `NULL`.
  //
  // The body came from `JSON.parse`, which cannot produce an own property whose value is
  // `undefined`, so "present" and "has a representable value" coincide here — and the two
  // conversions below fail closed rather than coerce if they ever do not.
  const assignments: PracticeSettingsAssignment[] = [];

  for (const field of MUTABLE_BOOLEAN_FIELDS) {
    if (Object.hasOwn(body, field)) {
      assignments.push({ field, value: readBoolean(body, field) });
    }
  }

  if (Object.hasOwn(body, RETENTION_POLICY_CODE)) {
    assignments.push({
      field: RETENTION_POLICY_CODE,
      value: readRetentionPolicyCode(body),
    });
  }

  // Gate 3, concluded — D-055 clause 14. `{}` and a body whose only members were stripped by the
  // whitelist arrive here with nothing to assign.
  //
  // NO `UPDATE`, NO VERSION INCREMENT, NO `updated_at` CHANGE. An empty patch is the ABSENCE of a
  // requested change, not a change that happens to change nothing, so it must not consume a
  // version. The check is here — before the statement — rather than after it, which is also why
  // the port's assignment type is a non-empty tuple: an empty write is not merely refused, it
  // does not type-check.
  const [first, ...rest] = assignments;

  if (first === undefined) {
    throw patchBodyEmpty();
  }

  return [first, ...rest];
}

/** The narrowed value of one submitted boolean field. */
function readBoolean(body: object, field: (typeof MUTABLE_BOOLEAN_FIELDS)[number]): boolean {
  const value = (body as Record<string, unknown>)[field];

  if (typeof value !== 'boolean') {
    // UNREACHABLE over HTTP, and a hard failure rather than a coercion. The schema gate above
    // already proved this value is a boolean, and `JSON.parse` cannot produce an own property
    // holding `undefined`. Reaching here means the two gates disagree, which is a defect in this
    // file and not a fault of the request — so it becomes a static `500`, never a guessed value.
    throw new IdentityInvariantError(
      'A submitted settings field passed schema validation but is not of the validated type. ' +
        'The assignment cannot be built without guessing a value the caller did not send.',
    );
  }

  return value;
}

/** The narrowed value of a submitted `retentionPolicyCode` — a string, or a requested SQL NULL. */
function readRetentionPolicyCode(body: object): string | null {
  const value = (body as Record<string, unknown>)[RETENTION_POLICY_CODE];

  // `null` is ACCEPTED and travels on as a real SQL `NULL`; the column is nullable. The empty
  // string is a legal value too and is not folded into `null` — no accepted authority says it
  // should be, and doing so would rewrite what the caller sent.
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    // Unreachable for the same reason as above; fail closed for the same reason.
    throw new IdentityInvariantError(
      'A submitted settings field passed schema validation but is not of the validated type. ' +
        'The assignment cannot be built without guessing a value the caller did not send.',
    );
  }

  return value;
}
