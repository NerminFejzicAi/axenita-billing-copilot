/**
 * The `P5-I4` audit vocabulary — three literals, and no fourth.
 *
 * Normative sources: `02` §15.4, §19.2, §29.4a.4 (append-only `audit_events`); `04` §7.5a.2 and
 * §7.5a.3 (the audit model); D-069 `RULING 5` (phase 5 is SELF-HASH ONLY); D-072 `OD-P5-I4-4`;
 * D-079 `RULING D`; `08` §12.12 obligations 15-17.
 *
 * ```text
 * P5_I4_AUDIT_SCOPE   = SUCCESSFUL_CREATE_ONLY
 * actor_type          = USER
 * resource_type       = PATIENT_REFERENCE
 * action              = PATIENT_REFERENCE_CREATED
 * ```
 *
 * `SUCCESSFUL_CREATE_ONLY` IS A SCOPE, NOT A PREFERENCE. `P5-I4` writes an audit row for a
 * genuinely successful new patient-reference creation and for nothing else: not for `GET`, not
 * for a validation failure, not for a missing or unaccepted `Idempotency-Key`, not for a replay,
 * not for an idempotency conflict, not for a request already in progress, not for a duplicate
 * external reference, not for pseudonym exhaustion, not for an internal failure, and not for a
 * transaction that rolled back. There is exactly ONE call site, inside the business mutation, and
 * every one of those outcomes either never reaches it or is rolled back with it.
 *
 * NO READ ACTION IS INTRODUCED. `DOCUMENT_VIEWED` is not recycled and `P5-I4` adds no read-audit
 * action of any kind (`04` §7.5a.3).
 *
 * THE LITERALS ARE `as const`, so they are literal types rather than `string`. A misspelling is a
 * compile error at the one call site rather than a permanently wrong row: `event_sha256` is
 * computed over these values and `audit_events` is append-only, so a wrong action cannot be
 * corrected later — there is no `UPDATE` grant and no `DELETE` grant at all.
 */

/** `audit_events.actor_type` — the actor is the authenticated end user (`04` §7.5a.3). */
export const AUDIT_ACTOR_TYPE_USER = 'USER' as const;

/** `audit_events.resource_type` for this slice. */
export const AUDIT_RESOURCE_TYPE_PATIENT_REFERENCE = 'PATIENT_REFERENCE' as const;

/** `audit_events.action` — the ONE action `P5-I4` writes. */
export const AUDIT_ACTION_PATIENT_REFERENCE_CREATED = 'PATIENT_REFERENCE_CREATED' as const;
