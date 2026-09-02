/**
 * `POST /api/v1/patient-references` — the first phase-5 tenant business WRITE.
 *
 * Normative sources: `03` §3.2, §3.4, §3.7.1, §4, §4.1, §4.2, §8, §8.1, §9 and §11; `02` §2.8.5,
 * §11, §15.2, §15.4 and `013_rls_policies_phase5`; `09` §4, §4.2, §9, §11 and §18.1; `15` §5;
 * D-054 clauses 6, 8, 10 and 12; D-060; D-062 part D; D-069 `RULING 4` and `RULING 5`; D-070;
 * D-072; D-073; D-077; D-078; D-079 `OD-P5-I4C-1` … `OD-P5-I4C-5` and `RULING B` … `RULING D`;
 * `08` §12.12.
 *
 * THE COMPLETE ORDER, AND WHY EVERY BOUNDARY IS WHERE IT IS
 *
 *     BEGIN                                              (D-047 clause 8 — ONE transaction)
 *   1   bearer verified                                  DevelopmentAuthGuard
 *   2   set_auth_subject_context / users / ACTIVE /      IdentityBootstrapService
 *       set_user_context                                 (03 §3.7.1 steps 1-2)
 *   3   X-Practice-ID read + validated                  \
 *       NO path/header comparison — HEADER_ONLY           |
 *   4   membership-scoped read of the practice, ACTIVE    |  TenantRequestPipeline
 *       ACTIVE membership of THIS user                    |  (steps 3-10, unchanged, shared)
 *   5   set_request_context(admitted practice)            |
 *   6-9 roles, settings, effective permissions            |
 *  10   patient_reference.create held                    /
 *       ---- everything below is reachable ONLY by a fully authorised caller ----
 *  11a  Idempotency-Key validated              400 IDEMPOTENCY_KEY_REQUIRED / 400 VALIDATION_ERROR
 *  11b  body root shape                        422
 *  11c  body schema, unknown fields REJECTED   422 (UNKNOWN_FIELD)
 *  11d  MANUAL-v1 normalisation                422
 *  11e  request_sha256 over the ORIGINAL body  <-- strictly AFTER 11b-11d
 *  11f  the canonical thirteen-step idempotent execution      IdempotencyService
 *         advisory lock / claim inspection / claim
 *         -> keyed token, at most five pseudonym candidates
 *         -> ONE audit event
 *         -> completion cache
 *     COMMIT
 *
 * NEITHER THE HEADER NOR THE BODY IS JUDGED BEFORE AUTHORISATION, AND THAT IS A SECURITY
 * PROPERTY. `03` §3.7.1 fixes the order and forbids reordering it. A caller who is unknown,
 * inactive, not a member, a member of an inactive practice or simply not permitted must receive
 * the canonical admission refusal and NOTHING ELSE — in particular no `errors[]` list naming the
 * fields of a resource they may not create, and no `Idempotency-Key` critique. This is also why
 * the controller carries no `@Body()` parameter: a global Nest parameter pipe necessarily runs
 * BEFORE the controller method body, and therefore before this transaction exists at all. The
 * settings write path made the same choice for the same reason.
 *
 * THE HEADER COMES BEFORE THE BODY (`OD-P5-I4C-2`). `Idempotency-Key` validation is a header
 * check and runs BEFORE scope inspection, BEFORE the advisory lock and BEFORE the body is
 * hashed, so an absent or unaccepted key derives no lock key, creates no claim and touches
 * `idempotency_keys` not at all.
 *
 * THE DIGEST IS TAKEN OVER THE VALIDATED **ORIGINAL PARSED** BODY (`03` §4.1, §4.2; D-069
 * `RULING 4`). Parse, keep the original value, validate it, then canonicalise and hash THAT.
 * The input is not the raw byte stream, not the pre-parse text, not the transformed DTO, not a
 * class instance and not a server-extended representation: the normalised external reference,
 * the keyed token, the generated pseudonym, the runtime route, the idempotency key, the tenant
 * and user identities and every server timestamp are all excluded, structurally, because
 * `requestSha256` accepts one argument and it is the body.
 *
 * ZERO FEATURE STATEMENTS FOR INVALID APPLICATION INPUT (`OD-P5-I4C-5`). Steps 11a to 11e are
 * all reached before the first `patient_references`, `idempotency_keys` or `audit_events`
 * statement, so an out-of-range `birthYear`, an unaccepted `sexCode`, a non-`MANUAL`
 * `sourceSystem` or an unknown field costs no round trip over any of them and SQLSTATE `23514`
 * never serves as ordinary validation. `patient_references_birth_year_check` remains the LAST
 * line of defence and is unchanged.
 */

import { Inject, Injectable, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { type PatientReferenceResponseDto, type Permission } from '@axenita/contracts';

import { AuditWriterService } from '../../audit/application/audit-writer.service.js';
import { API_VALIDATION_PIPE_OPTIONS } from '../../common/validation/validation-pipe-options.js';
import { getRequestId } from '../../common/request-context/request-context.storage.js';
import { CryptoOperationError } from '../../crypto/crypto.errors.js';
import {
  EXTERNAL_REFERENCE_HMAC,
  type ExternalReferenceHmac,
} from '../../crypto/external-reference.port.js';
import { type JsonValue } from '../../crypto/json-canonicalizer.js';
import { normaliseManualV1ExternalIdentifier } from '../../crypto/manual-v1-identifier-normalizer.js';
import { requestSha256 } from '../../crypto/request-sha256.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { TenantDatabaseService } from '../../database/tenant-database.service.js';
import { IdentityBootstrapService } from '../../identity/application/identity-bootstrap.service.js';
import { TenantRequestPipeline } from '../../identity/application/tenant-request.pipeline.js';
import { IdempotencyService } from '../../idempotency/application/idempotency.service.js';
import { IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES } from '../../idempotency/idempotency.constants.js';
import { validateIdempotencyKey } from '../../idempotency/domain/idempotency-key.js';
import { PseudonymGenerator } from '../domain/pseudonym.generator.js';
import { CreatePatientReferenceDto } from '../dto/create-patient-reference.dto.js';
import {
  DuplicateExternalReferenceError,
  type PatientReferenceRow,
} from '../infrastructure/patient-reference-database.port.js';
import { PatientReferenceDatabase } from '../infrastructure/patient-reference.database.js';
import {
  externalPatientReferenceInvalid,
  patientReferenceAlreadyExists,
  patientReferenceCreationFailed,
  requestBodyNotAnObject,
} from '../patient-reference.errors.js';
import { projectPatientReference } from './patient-reference-projection.js';

/**
 * The permission this endpoint requires (`03` §11, `15` §5).
 *
 * `patient_reference.create`, NOT `patient_reference.read`: creating and reading this resource are
 * separate cells of the matrix and the write route must not inherit the read route's answer.
 * Typed as {@link Permission}, so a typo is a compile error rather than a permission that is
 * silently never granted.
 */
const REQUIRED_PERMISSION: Permission = 'patient_reference.create';

/** `PSEUDONYM_INSERT_MAX_ATTEMPTS = 5` (`04` §7.5a.3; D-072 `OD-P5-I4-1`). */
export const PSEUDONYM_INSERT_MAX_ATTEMPTS = 5;

/** The HMAC domain of a patient external reference (D-060; `04` §7.5a.3). */
const PATIENT_EXTERNAL_REFERENCE_DOMAIN = 'patient_external_ref';

/** The one accepted `source_system` of this slice (D-072 `OD-P5-I4-9`). */
const MANUAL_SOURCE_SYSTEM = 'MANUAL';

/**
 * The delayed body validator — the SAME configuration as the global pipe, built from the SAME
 * frozen constant (`validation-pipe-options.ts`).
 *
 * A module-level singleton because it is stateless: a `ValidationPipe` holds only its options, so
 * one instance serves every request and none can influence another. Re-implementing the checks by
 * hand would produce a second dialect of "invalid request" — a different status, a different
 * document and different field codes — that no existing test covers.
 */
const createBodyValidator = new ValidationPipe(API_VALIDATION_PIPE_OPTIONS);

/** Everything one `POST` request supplies. Every member is untrusted until proven otherwise. */
export interface PatientReferenceCreateRequest {
  /** The subject of an already verified bearer credential (never a body, query or header). */
  readonly verifiedAuthSubject: string;
  /** The raw `X-Practice-ID` value, or `undefined` when the client sent none. */
  readonly practiceContextHeader: string | undefined;
  /**
   * The raw `Idempotency-Key` value, or `undefined` when the client sent none.
   *
   * `undefined` and `''` reach the validator as DIFFERENT values and nothing on the way in may
   * collapse them, even though `OD-P5-I4C-2` gives both the same answer.
   */
  readonly idempotencyKeyHeader: string | undefined;
  /**
   * The parsed JSON request body, exactly as the body parser produced it, with NO schema applied.
   *
   * Typed `unknown` on purpose. It is validated inside this service, after authorisation, and the
   * type is what stops any layer above from assuming a shape that has not been proven yet. It is
   * ALSO the value that is hashed, unchanged, which is why it is carried rather than replaced.
   */
  readonly body: unknown;
}

/** The four validated values the mutation needs, read from the ORIGINAL parsed body. */
interface ValidatedCreateCommand {
  readonly sourceSystem: string;
  /** The canonical MANUAL-v1 value — the exact string the HMAC message consumes. */
  readonly normalisedExternalReference: string;
  readonly birthYear: number | null;
  readonly sexCode: string | null;
}

@Injectable()
export class PatientReferenceCreateService {
  public constructor(
    private readonly identityBootstrap: IdentityBootstrapService,
    private readonly tenantRequests: TenantRequestPipeline,
    private readonly tenantDatabase: TenantDatabaseService,
    private readonly patientReferences: PatientReferenceDatabase,
    private readonly idempotency: IdempotencyService,
    private readonly auditWriter: AuditWriterService,
    private readonly pseudonyms: PseudonymGenerator,
    @Inject(EXTERNAL_REFERENCE_HMAC)
    private readonly externalReferenceHmac: ExternalReferenceHmac,
  ) {}

  /**
   * Resolves the caller, admits the tenant request, and creates the patient reference at most
   * once per canonical idempotency scope.
   *
   * Returns only for a caller who is an `ACTIVE` user, holds an ACTIVE membership in the `ACTIVE`
   * practice named by `X-Practice-ID`, derives `patient_reference.create` from the roles of THAT
   * membership, supplied an accepted `Idempotency-Key`, and sent a body that passes the schema and
   * the MANUAL-v1 profile. Every other outcome throws, which rolls the transaction back and
   * discards every `app.*` setting, the claim, the business row and the audit row with it.
   */
  public async createPatientReference(
    request: PatientReferenceCreateRequest,
  ): Promise<PatientReferenceResponseDto> {
    return this.identityBootstrap.runAuthenticatedSession(
      request.verifiedAuthSubject,
      async (session, user) => {
        // Steps 3 to 10, through the SAME single pipeline every tenant route uses. The admitted
        // user is NOT passed, because there is no parameter for one (D-054 clause 12).
        //
        // EVERY LINE BELOW THIS ONE IS REACHABLE ONLY BY A CALLER WHO HOLDS
        // `patient_reference.create` IN THE ADMITTED PRACTICE.
        const admitted = await this.tenantRequests.admit(session, {
          // `HEADER_ONLY` (D-073): this route's path carries no practice identity, so there is
          // nothing to compare and nothing to fake.
          scope: { mode: 'HEADER_ONLY' },
          practiceContextHeader: request.practiceContextHeader,
          requiredPermission: REQUIRED_PERMISSION,
        });

        // Step 11a — the header, and STRICTLY BEFORE the body, the hash and the lock
        // (`OD-P5-I4C-2`). The accepted key travels on unchanged: never trimmed, never
        // normalised, never truncated.
        const idempotencyKey = validateIdempotencyKey(request.idempotencyKeyHeader);

        // Steps 11b to 11d — root shape, schema (unknown fields REJECTED, not stripped), and the
        // MANUAL-v1 profile. All three run before the digest, so nothing that fails them is ever
        // hashed and nothing that fails them ever reaches a statement.
        const command = await validateCreateCommand(request.body);

        // Step 11e — the canonical digest, over the ORIGINAL parsed body. `request.body` is the
        // value the body parser produced from `JSON.parse`, so it IS a JSON value; the cast
        // states that and adds nothing. Note what is NOT passed: the normalised reference, the
        // keyed token, the pseudonym, the route, the key, the tenant, the user and the clock.
        const digest = requestSha256(request.body as JsonValue);

        // The facade narrows the admitted request to the statement surface of this tenant. It
        // opens no transaction, owns no client and establishes nothing.
        const tenant = this.tenantDatabase.forAdmittedRequest(session, admitted);

        // ONE instant for the whole request: `locked_at`, `expires_at`, `completed_at`,
        // `created_at`, `updated_at` and the audit `occurred_at` all describe the same moment,
        // and the audit instant in particular is generated exactly once and persisted unchanged
        // (`04` §7.5a.3). No database `now()` substitute anywhere on this path.
        const instant = new Date();

        // Step 11f — the canonical thirteen-step order lives in the idempotency service, and the
        // business half is handed to it as the two members below. The claim cannot be completed
        // without the mutation having run, and the mutation cannot run without the claim, because
        // neither statement is reachable from here.
        return this.idempotency.runOnce(
          tenant,
          {
            scope: {
              practiceId: admitted.practiceId,
              // The ADMITTED user — the identity the session established in `app.user_id`, not a
              // value any caller supplied.
              userId: user.id,
              // The canonical `03` §4 spelling, NOT the runtime mount path (`OD-P5-I4C-1`). The
              // type admits no other value, so a routing-derived string would not compile.
              endpoint: IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES,
              idempotencyKey,
            },
            requestSha256: digest,
            claimId: randomUUID(),
            instant,
          },
          {
            execute: async () => {
              const row = await this.insertPatientReference(
                tenant,
                admitted.practiceId,
                command,
                instant,
              );

              // Step 11 of `04` §7.5a.3 — the success audit event, in THIS transaction, after a
              // row genuinely exists. A failure here is not caught: it rolls the business row
              // back with it.
              await this.auditWriter.recordPatientReferenceCreated(tenant, {
                id: randomUUID(),
                practiceId: admitted.practiceId,
                actorUserId: user.id,
                resourceId: row.id,
                occurredAt: instant,
                requestId: getRequestId() ?? null,
              });

              return { resourceId: row.id, result: projectPatientReference(row) };
            },

            // The replay reconstruction — a tenant-scoped IMMUTABLE READ through the SAME
            // `P5-I4A` statement `GET` uses, projected through the SAME canonical path. The
            // cache is a pointer and the document is rebuilt, so a replay body cannot drift from
            // an original body (`03` §4.2). It writes nothing, so a replay produces NO second
            // create audit event — structurally, not by a flag.
            replay: async (resourceId: string) => {
              const row = await this.patientReferences.findInAdmittedPractice(tenant, resourceId);

              return row === undefined ? undefined : projectPatientReference(row);
            },
          },
        );
      },
    );
  }

  /**
   * Step 10 — the keyed token and the targeted pseudonym insert, with at most five candidates.
   *
   * THE LOOP IS THE WHOLE RETRY MODEL, and it is deliberately small:
   *
   * - a FRESH CSPRNG candidate per attempt, drawn from the seam. There is no deterministic
   *   fallback candidate and no derivation from the external identifier (`03` §11);
   * - AT MOST FIVE attempts (`PSEUDONYM_INSERT_MAX_ATTEMPTS`), so exhaustion is bounded rather
   *   than a spin;
   * - no pre-read, no `SAVEPOINT`, no nested transaction and no second transaction. The targeted
   *   `ON CONFLICT ... DO NOTHING` raises nothing on a pseudonym collision, so the transaction
   *   stays usable and the next attempt is simply the next statement (`04` §7.5a.3);
   * - NOTHING about the attempts is observable. No candidate, no attempt number, no collision
   *   count and no constraint name reaches the response, and the exhaustion answer is the shared
   *   static `500`.
   *
   * The keyed token is computed ONCE, outside the loop: it does not depend on the candidate, and
   * recomputing it per attempt would only widen the window in which key material is touched.
   */
  private async insertPatientReference(
    tenant: AdmittedTenantSession,
    practiceId: string,
    command: ValidatedCreateCommand,
    instant: Date,
  ): Promise<PatientReferenceRow> {
    // The canonical message is domain-separated, practice-scoped and `source_system`-scoped, and
    // the value is the MANUAL-v1 normalised one (D-060, D-070). The PLAINTEXT identifier stops
    // here: only `h1.<64 hex>` travels into the statement, and the raw value is never persisted,
    // returned, logged or audited.
    const externalPatientRefHash = this.externalReferenceHmac.compute({
      domain: PATIENT_EXTERNAL_REFERENCE_DOMAIN,
      practiceId,
      sourceSystem: MANUAL_SOURCE_SYSTEM,
      value: command.normalisedExternalReference,
    });

    // The resource identifier is drawn once and reused across attempts: a pseudonym collision
    // inserts NO row (`DO NOTHING`), so the identifier is still free, and keeping it stable means
    // the retry changes exactly one thing — the candidate pseudonym.
    const id = randomUUID();

    for (let attempt = 0; attempt < PSEUDONYM_INSERT_MAX_ATTEMPTS; attempt += 1) {
      const row = await this.attemptInsert(tenant, {
        id,
        practiceId,
        sourceSystem: command.sourceSystem,
        externalPatientRefHash,
        pseudonym: this.pseudonyms.next(),
        birthYear: command.birthYear,
        sexCode: command.sexCode,
        instant,
      });

      if (row !== undefined) {
        return row;
      }
    }

    // Five consecutive collisions over a `32^10` CSPRNG space. Reported as the shared static
    // `500`, indistinguishable from any other internal failure, and never as a retry count.
    throw patientReferenceCreationFailed();
  }

  /**
   * ONE insert attempt, with the ONE canonical `23505` translation.
   *
   * `patient_references_source_external_ref_key` becomes `409
   * PATIENT_REFERENCE_ALREADY_EXISTS` — never `200`, never a disclosure of the existing row and
   * never `IDEMPOTENCY_CONFLICT` (D-072 `OD-P5-I4-10`). Every OTHER error, including every other
   * `23505`, propagates unchanged and becomes the shared `500`, which is exactly what
   * `04` §7.5a.3 requires and is achieved by NOT catching it.
   */
  private async attemptInsert(
    tenant: AdmittedTenantSession,
    insert: Parameters<PatientReferenceDatabase['insertWithCandidatePseudonym']>[1],
  ): Promise<PatientReferenceRow | undefined> {
    try {
      return await this.patientReferences.insertWithCandidatePseudonym(tenant, insert);
    } catch (error) {
      if (error instanceof DuplicateExternalReferenceError) {
        throw patientReferenceAlreadyExists();
      }

      throw error;
    }
  }
}

/**
 * Steps 11b to 11d — turns an untrusted parsed body into the four validated values.
 *
 * Three gates, in this order and for this reason:
 *
 * 1. ROOT SHAPE, explicitly, and not left to emerge from `class-transformer`'s handling of odd
 *    inputs. A body that is not a non-null, non-array object carries none of the required members
 *    by definition.
 * 2. SCHEMA, through the delayed `ValidationPipe` with the shared frozen options. This is where
 *    `sourceSystem = MANUAL`, the closed `sexCode` vocabulary, the `1900..2200` `birthYear` range
 *    and the `UNKNOWN_FIELD` refusal all happen — and it runs BEFORE the digest is taken, so a
 *    body carrying an unknown field is never hashed (`03` §4.2, `04` §7.5a.3).
 * 3. THE MANUAL-v1 PROFILE, which is validation and not transformation of the hashed material:
 *    the digest is taken over the ORIGINAL body regardless of what normalisation produces.
 *
 * THE VALUES ARE READ FROM THE RAW PARSED BODY, NOT FROM THE DTO INSTANCE. A compiled class field
 * and `class-transformer` may both materialise an omitted property as an own property whose value
 * is `undefined`, so reading the instance's keys would invent members the caller never sent — the
 * identical reasoning the settings write path records.
 */
async function validateCreateCommand(body: unknown): Promise<ValidatedCreateCommand> {
  // Gate 1.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw requestBodyNotAnObject();
  }

  // Gate 2. Throws the repository's standard `422 VALIDATION_ERROR` document with the stable
  // field codes: `UNKNOWN_FIELD` for an unmodelled member, `INVALID_ENUM_VALUE` for a
  // non-`MANUAL` `sourceSystem` or an unaccepted `sexCode`, `OUT_OF_RANGE` for a `birthYear`
  // outside `1900..2200`, `REQUIRED` for an omitted mandatory member. The RESULT IS DELIBERATELY
  // DISCARDED — it answers "is every submitted value acceptable?" and that is all it is for.
  await createBodyValidator.transform(body, { type: 'body', metatype: CreatePatientReferenceDto });

  // Gate 3. The accepted MANUAL-v1 profile, consumed unchanged (D-070): valid Unicode, no `NUL`,
  // no C0/C1 control, one leading BOM removed, outer whitespace trimmed, `NFC`, non-empty, and at
  // most 255 UTF-8 BYTES measured over the FINAL normalised form. No second pipeline is invented.
  const normalisedExternalReference = normaliseManualV1(
    readString(body, 'externalPatientReference'),
  );

  return {
    sourceSystem: readString(body, 'sourceSystem'),
    normalisedExternalReference,
    birthYear: readNullableNumber(body, 'birthYear'),
    sexCode: readNullableString(body, 'sexCode'),
  };
}

/**
 * The MANUAL-v1 normalised value, or the generic `422`.
 *
 * The profile's own rejection reason is a static literal and is nevertheless NOT rendered: the
 * response says only that the request was invalid, so the endpoint cannot be used to probe which
 * rule a crafted identifier tripped. Only {@link CryptoOperationError} is translated — a
 * configuration failure is not a client fault and must not become a `422`.
 */
function normaliseManualV1(raw: string): string {
  try {
    return normaliseManualV1ExternalIdentifier(raw);
  } catch (error) {
    if (error instanceof CryptoOperationError) {
      throw externalPatientReferenceInvalid();
    }

    throw error;
  }
}

/** A member the schema has already proven to be a present string. */
function readString(body: object, field: string): string {
  const value = (body as Record<string, unknown>)[field];

  if (typeof value !== 'string') {
    // UNREACHABLE over HTTP: gate 2 proved this member is a present string, and `JSON.parse`
    // cannot produce an own property holding `undefined`. Reaching here means the two gates
    // disagree, which is a defect in this file rather than a fault of the request — so it becomes
    // the shared static `500`, never a guessed value.
    throw patientReferenceCreationFailed();
  }

  return value;
}

/** A nullable numeric member: absent and explicit `null` are both SQL `NULL`. */
function readNullableNumber(body: object, field: string): number | null {
  const value = (body as Record<string, unknown>)[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number') {
    // Unreachable for the same reason as above; fail closed for the same reason.
    throw patientReferenceCreationFailed();
  }

  return value;
}

/** A nullable string member: absent and explicit `null` are both SQL `NULL`. */
function readNullableString(body: object, field: string): string | null {
  const value = (body as Record<string, unknown>)[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    // Unreachable for the same reason as above; fail closed for the same reason.
    throw patientReferenceCreationFailed();
  }

  return value;
}
