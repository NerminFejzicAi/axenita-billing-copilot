/**
 * `GET /api/v1/practices/{practiceId}` response contract.
 *
 * Normative source: `03_API_CONTRACT_V1.md` §"GET `/practices/{practiceId}`", reproduced field
 * for field. Supporting decision: D-047 clause 11, which resolved D-OPEN-011 and made
 * `practice.read` an `ALLOW` for `PRACTICE_ADMIN` and a `DENY` for the other six roles.
 *
 * `/practices/{practiceId}` is a TENANT route (`03` §3.4): `X-Practice-ID` is mandatory and the
 * `practiceId` of the path must be the very same practice.
 *
 * What this contract deliberately does NOT contain:
 *
 * - `zsrNumber`, `glnNumber` and `legalName`. They are not merely omitted from the projection:
 *   `copilot_app` has no column grant for any of them (`02` §20.2a, D-047 clause 6), so they are
 *   unreachable at the database level too. A sensitive or administrative practice DTO does not
 *   exist in v1 and would require a new permission, a new ADR, a widened grant and a permanent
 *   audit row (D-047 clause 11);
 * - `createdAt` and `updatedAt` — internal columns, likewise without a grant;
 * - membership, role, permission, settings or auth-subject information. `practice.read`
 *   authorises reading the non-sensitive DTO of the CURRENT tenant practice and nothing else.
 *   The settings routes belong to phase 4 and are not registered in phase 3 (D-049).
 *
 * There is no list and no directory of practices; such a route does not exist (D-047 clause 11).
 */

/**
 * The complete `GET /practices/{practiceId}` document.
 *
 * Every member is non-nullable, exactly as the `practices` columns are (`02` §6.1).
 *
 * `status` is typed as a plain string rather than as an `entity_status` vocabulary, for the same
 * reason the identity contract keeps `preferredLanguage` a string: this package publishes the
 * HTTP shape, not the database enum. In practice the value is always `ACTIVE` — a practice whose
 * status is anything else is rejected with `403 ACCESS_DENIED` and a rollback before any
 * projection happens (D-047 clause 10), so a non-`ACTIVE` value can never be rendered here.
 */
export interface PracticeResponseDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly defaultLanguage: string;
  readonly timezone: string;
  readonly status: string;
}
