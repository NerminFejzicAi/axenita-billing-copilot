import { auditEventHashRejected } from './crypto.errors.js';
import type { JsonObject, JsonValue } from './json-canonicalizer.js';

/**
 * The canonical lowercase hyphenated UUID form, and only that form.
 *
 * Deliberately not case insensitive: `04` §7.5a.3 says the payload's UUID values ARE lowercase
 * canonical hyphenated strings, so an uppercase one is refused rather than lowercased. See
 * {@link canonicalUuid}.
 */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * One audit event, as the application holds it just before the row is written.
 *
 * FOUR OF THE SEVENTEEN COLUMNS ARE ABSENT FROM THIS TYPE ON PURPOSE, and a fifth is absent for
 * a stronger reason still. See {@link buildAuditEventHashPayloadV1}.
 */
export interface AuditEventHashInput {
  /** `audit_events.id` — generated exactly once, before hashing, and written unchanged. */
  readonly id: string;
  /** `audit_events.practice_id`. */
  readonly practiceId: string;
  /**
   * `audit_events.occurred_at` — the application instant, generated exactly ONCE and persisted
   * as the same value. Never a database `now()` / `CURRENT_TIMESTAMP` substitute.
   */
  readonly occurredAt: Date;
  /** `audit_events.actor_type`. */
  readonly actorType: string;
  /** `audit_events.actor_user_id`, `null` for a non-user actor. */
  readonly actorUserId: string | null;
  /** `audit_events.actor_service`, `null` for a user actor. */
  readonly actorService: string | null;
  /** `audit_events.action`. */
  readonly action: string;
  /** `audit_events.resource_type`. */
  readonly resourceType: string;
  /** `audit_events.resource_id`. */
  readonly resourceId: string | null;
  /** `audit_events.request_id` — `varchar(100)`, not a UUID column. */
  readonly requestId: string | null;
  /** `audit_events.previous_value` — the final SANITISED stored representation. */
  readonly previousValue: JsonValue | null;
  /** `audit_events.new_value` — the final SANITISED stored representation. */
  readonly newValue: JsonValue | null;
  /** `audit_events.metadata` — `jsonb NOT NULL`, so a value is always required. */
  readonly metadata: JsonValue;
}

/**
 * `AUDIT_EVENT_HASH_PAYLOAD_V1` — the exact seventeen-key object that `event_sha256` is taken
 * over (D-069 `RULING 5`; D-072 `OD-P5-I4-4`; D-077 `RULING E`; `04` §7.5a.2).
 *
 * ```text
 * id, practice_id, occurred_at, actor_type, actor_user_id, actor_service,
 * action, resource_type, resource_id, request_id, session_id_hash,
 * ip_address, user_agent_hash, previous_value, new_value, metadata,
 * previous_event_sha256
 * ```
 *
 * SEVENTEEN. Not eighteen, not sixteen. The keys are the DATABASE COLUMN NAMES — `snake_case`,
 * never the application's `camelCase` — because the contract is a property of the stored row,
 * and a later slice must be able to rebuild all seventeen values FROM that row and reproduce
 * the digest byte for byte.
 *
 * `event_sha256` IS EXCLUDED FROM ITS OWN INPUT, and it is excluded STRUCTURALLY: it is not a
 * field of {@link AuditEventHashInput} and it is not written below, so no caller can supply it
 * and no edit can accidentally fold a digest into the material it is computed from.
 *
 * FOUR VALUES ARE FIXED `null` IN PHASE 5, and they are fixed here rather than accepted as
 * parameters, which is what makes them impossible to set by mistake:
 *
 *  - `session_id_hash`, `ip_address`, `user_agent_hash` — phase 5 does not collect them, and NO
 *    `inet` text format is invented for `ip_address` (D-072 `OD-P5-I4-4`);
 *  - `previous_event_sha256` — phase 5 audit is SELF-HASH ONLY. D-069 `RULING 5` DEFERS
 *    predecessor chaining to a later governance decision that must settle chain scope, ordering,
 *    locking, concurrent writers, fork prevention, retention and genesis semantics. Accepting a
 *    predecessor here would quietly invent the very chain that decision is reserved for, so the
 *    formatter cannot express one.
 *
 * IT IS PRESENT AS `null`, NEVER OMITTED. Absence and explicit `null` are different JSON
 * documents and therefore different digests, so the key is always written.
 *
 * @throws CryptoOperationError if a UUID is not canonical lowercase hyphenated, or the instant
 * is not representable.
 */
export function buildAuditEventHashPayloadV1(event: AuditEventHashInput): JsonObject {
  // Written in the documented column order for review. Key ORDER here is irrelevant to the
  // digest — JCS sorts by UTF-16 code unit before serialising — so this ordering is for the
  // reader, not for the hash.
  return {
    id: canonicalUuid(event.id),
    practice_id: canonicalUuid(event.practiceId),
    occurred_at: formatAuditOccurredAt(event.occurredAt),
    actor_type: event.actorType,
    actor_user_id: event.actorUserId === null ? null : canonicalUuid(event.actorUserId),
    actor_service: event.actorService,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId === null ? null : canonicalUuid(event.resourceId),
    request_id: event.requestId,
    session_id_hash: null,
    ip_address: null,
    user_agent_hash: null,
    // JSON VALUES, never JSON strings. These columns are `jsonb`; embedding them as strings
    // would hash the quoting and escaping of a serialisation instead of the data itself.
    previous_value: event.previousValue,
    new_value: event.newValue,
    metadata: event.metadata,
    previous_event_sha256: null,
  };
}

/**
 * The audit hashing representation of one instant:
 * `YYYY-MM-DDTHH:mm:ss.SSS000Z` (`AUDIT_OCCURRED_AT_FORMAT =
 * UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO`, D-072 `OD-P5-I4-4`).
 *
 * UTC, exactly SIX fractional digits, of which the LAST THREE ARE LITERALLY `000`, and a
 * capital terminal `Z`. Phase 5 keeps millisecond precision, so the microsecond digits carry no
 * information — they exist because the column is `timestamptz(6)` and the stored value must
 * round-trip into the same six-digit string a reproduction reads back.
 *
 * `toISOString()` ALONE IS NOT ENOUGH: it emits three fractional digits. The authorised
 * derivation is exactly the one applied here — take the UTC millisecond ISO form and
 * deterministically EXTEND its terminal fraction. No locale formatting, no `+00:00` offset
 * form, no database-generated substitute.
 *
 * THIS IS NOT THE D-073 FORMATTER, AND THE TWO MUST NEVER BE SHARED. The public
 * patient-reference `createdAt` wire contract is `.sssZ` — three digits — and belongs to
 * P5-I4A (D-073):
 *
 * ```text
 * .sssZ     = public patient-reference wire surface   (P5-I4A, D-073)
 * .SSS000Z  = audit occurred_at hash surface          (P5-I4B, OD-P5-I4-4)
 * ```
 *
 * Two separate canonical representation surfaces. This function lives in the audit module and
 * is named for the audit surface precisely so that neither can be reached from the other by
 * accident.
 *
 * @throws CryptoOperationError if the instant is not representable as a UTC ISO string.
 */
export function formatAuditOccurredAt(instant: Date): string {
  const milliseconds = instant.getTime();

  // An `Invalid Date` would make `toISOString()` throw a `RangeError` carrying no contract
  // meaning; refuse it deterministically instead.
  if (!Number.isFinite(milliseconds)) {
    throw auditEventHashRejected('INVALID_OCCURRED_AT');
  }

  // `YYYY-MM-DDTHH:mm:ss.sssZ` — always UTC, always three fractional digits, always terminal
  // `Z` for a year inside the four-digit range.
  const isoMilliseconds = instant.toISOString();

  if (!isoMilliseconds.endsWith('Z') || isoMilliseconds.length !== 24) {
    // A year outside `0000`-`9999` widens the form (`+275760-09-13T00:00:00.000Z`), which is
    // not the canonical shape. No audit event has such a timestamp, so it is refused rather
    // than reshaped.
    throw auditEventHashRejected('INVALID_OCCURRED_AT');
  }

  // Extend `.sss` to `.SSS000` by appending the three zero digits the contract fixes.
  return `${isoMilliseconds.slice(0, -1)}000Z`;
}

/**
 * `value` if it is already a canonical lowercase hyphenated UUID.
 *
 * FAIL CLOSED, DO NOT REPAIR. Lowercasing an uppercase input would be a silent transformation
 * of permanent hash material: the digest would then describe a value that differs from the one
 * the caller passed and, depending on how the row was later read back, possibly from the one
 * stored. A reproduction from the stored row has to yield the same seventeen values, so the
 * only safe response to a non-canonical UUID is refusal.
 */
function canonicalUuid(value: string): string {
  if (!CANONICAL_UUID.test(value)) {
    throw auditEventHashRejected('NON_CANONICAL_UUID');
  }

  return value;
}
