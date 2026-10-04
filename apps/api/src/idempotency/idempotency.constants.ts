/**
 * The canonical idempotency identity of one request — the endpoint literal and the scope.
 *
 * Normative sources: `03` §4 (the mandatory `Idempotency-Key` surfaces and the
 * `practice + user + endpoint` key scope), §4.2; `02` §15.2 (`idempotency_keys_scope_key`);
 * D-072 (the idempotency transaction model); D-079 `OD-P5-I4C-1` and `RULING D`.
 *
 * TWO ENDPOINT SURFACES EXIST AND THEY ARE DELIBERATELY DIFFERENT (`OD-P5-I4C-1`)
 *
 *     runtime route                POST /api/v1/patient-references
 *     persisted idempotency key    POST /patient-references
 *
 * The persisted value is the canonical mandatory-endpoint spelling of `03` §4, LITERALLY. It is
 * NOT derived from the runtime mount path, is NOT persisted as `/api/v1/patient-references`, and
 * is NOT replaced by a symbolic operation identifier. Folding the `/api/v1` mount prefix into the
 * persisted key would make scope uniqueness a function of DEPLOYMENT CONFIGURATION: remount the
 * application and yesterday's replay stops resolving. The endpoint identity is excluded from the
 * `request_sha256` digest anyway (`03` §4.1), so the two surfaces never meet in a hash.
 *
 * THE TYPE IS WHAT MAKES THIS UNBYPASSABLE. {@link IdempotencyEndpoint} is a LITERAL UNION, not
 * `string`. A route cannot pass `request.route.path`, `request.originalUrl` or any other value
 * produced by the router into an idempotency scope, because none of them type-check. A future
 * `Idempotency-Key` surface adds its own `03` §4 spelling to this file — the standing rule of
 * `OD-P5-I4C-1` — and gains no other way in.
 */

/**
 * `POST /patient-references`, the canonical `03` §4 spelling, byte for byte.
 *
 * `as const` so the exported value is the literal type and not `string`.
 */
export const IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES = 'POST /patient-references' as const;

/**
 * `POST /encounters`, the canonical `03` §4 spelling, byte for byte (`P5-I5B`; D-085
 * `OD-D085-7`). Added under the standing rule of `OD-P5-I4C-1`; nothing else about the mechanism
 * changes.
 */
export const IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS = 'POST /encounters' as const;

/**
 * `POST /encounters/{encounterId}/cancel`, the canonical `03` §4 spelling, byte for byte
 * (`P5-I5D`; D-089 `OD-P5-I5D-2`).
 *
 * A TEMPLATE, NOT A CONCRETE PATH. `{encounterId}` is part of the literal and is never replaced by
 * the requested identifier: the scope is "this user's cancel command under this key", and which
 * encounter a completed claim belongs to is the cached `resourceId`, checked against the request
 * path by the resource binding of `IdempotencyService` rather than folded into the scope.
 */
export const IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL =
  'POST /encounters/{encounterId}/cancel' as const;

/**
 * Every endpoint literal that currently has an implemented `Idempotency-Key` surface.
 *
 * `03` §4 lists nine mandatory surfaces; exactly three of them are implemented so far
 * (`P5-I4C`, `P5-I5B`, `P5-I5D`), so exactly three literals exist here. The others are NOT
 * pre-declared: a literal in this union would advertise an idempotency scope for a route that does
 * not exist, and the persisted `endpoint` value of a future route is that route's slice to ratify,
 * not this one's to guess.
 */
export type IdempotencyEndpoint =
  | typeof IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES
  | typeof IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS
  | typeof IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL;

/** The success statuses an idempotent command may complete with (`03` §4.2; D-089 `RULING D`). */
export type IdempotencySuccessStatus = 200 | 201;

/**
 * The success status each endpoint's completion cache records — a CLOSED map, keyed by the
 * endpoint identity (D-089 `RULING D`, extension 1).
 *
 * NOT A CALLER PARAMETER. The status a replay is answered with is a property of the endpoint, so
 * it is looked up here from the canonical scope and no route can choose it per request: a caller
 * able to pick the cached status could record a replayable `204` or `200` for a command whose
 * contract is `201`. `satisfies Record<...>` makes the map EXHAUSTIVE — a literal added to
 * {@link IdempotencyEndpoint} without a status here fails `tsc` and the build.
 */
export const IDEMPOTENCY_SUCCESS_STATUS = Object.freeze({
  [IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES]: 201,
  [IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS]: 201,
  [IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL]: 200,
} as const satisfies Record<IdempotencyEndpoint, IdempotencySuccessStatus>);

/**
 * The canonical uniqueness scope of one idempotent command (`03` §4; `02` §15.2).
 *
 *     unique (practice_id, user_id, endpoint, idempotency_key)
 *
 * FOUR COMPONENTS, AND THE SAME FOUR EVERYWHERE. The persisted scope, the advisory-lock preimage
 * and the claim lookup all read this one object, so the lock a request takes and the row it then
 * inspects cannot describe different scopes (D-079 `OD-P5-I4C-3`).
 *
 * `practiceId` and `userId` are the ADMITTED practice and the ADMITTED user — the values the
 * tenant pipeline established in `app.practice_id` and `app.user_id`. Neither is ever a header, a
 * path segment or a body member.
 */
export interface IdempotencyScope {
  readonly practiceId: string;
  readonly userId: string;
  readonly endpoint: IdempotencyEndpoint;
  readonly idempotencyKey: string;
}

/**
 * `IDEMPOTENCY_TTL_HOURS = 48` (`03` §4.2; D-072; D-079 `RULING D`).
 *
 * Within the canonical "retention 24-72 hours per endpoint" range of `03` §4 and fixed at 48 for
 * this endpoint. `expires_at = claim_time + 48h`, written ONCE at claim time and NEVER changed
 * afterwards — there is no update path that names the column and no grant that would allow one.
 */
export const IDEMPOTENCY_TTL_HOURS = 48;

/** 48 hours, in milliseconds — the offset applied to the single claim instant. */
export const IDEMPOTENCY_TTL_MILLISECONDS = IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;

/**
 * The canonical spelling of the idempotency header (`03` §4).
 *
 * Express resolves header names case-insensitively, so the canonical spelling is used verbatim
 * at the one place the header is read. No alternative name is read and no fallback exists.
 */
export const IDEMPOTENCY_KEY_HEADER_NAME = 'Idempotency-Key';
