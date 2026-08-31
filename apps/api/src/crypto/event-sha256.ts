import type { AuditEventHashInput } from './audit-event-hash-payload.js';
import { buildAuditEventHashPayloadV1 } from './audit-event-hash-payload.js';
import { canonicaliseJson } from './json-canonicalizer.js';
import { sha256HexUtf8 } from './sha256-utf8.js';

/**
 * The self-hash written to `audit_events.event_sha256`.
 *
 * ```text
 * event_sha256 = SHA-256( UTF8( JCS( AUDIT_EVENT_HASH_PAYLOAD_V1 ) ) )
 * ```
 *
 * (D-069 `RULING 5`; D-072 `OD-P5-I4-4`; D-077 `RULING E`; `04` §7.5a.2.)
 *
 * SELF-HASH ONLY. It commits to ONE event and makes no claim about any other. Phase 5 asserts
 * NO linear hash chain — `previous_event_sha256` is always `null` — so this digest detects
 * tampering with the row it belongs to and nothing more. Chain semantics are deferred to a
 * later governance decision (D-069 `RULING 5`) and must not be inferred from this helper.
 *
 * THE DIGEST CANNOT CONTAIN ITSELF. The payload builder has no `event_sha256` field to set, so
 * the exclusion holds by construction rather than by a filter that could be edited away.
 *
 * THE INSTANT AND THE ID ARE GENERATED ONCE, BY THE CALLER, BEFORE THIS RUNS, and the SAME
 * values are then persisted. Regenerating either during the `INSERT` is prohibited: the stored
 * row would no longer reproduce its own digest.
 *
 * @returns exactly 64 lowercase hexadecimal characters.
 * @throws CryptoOperationError if the event is not acceptable to the formatter or the payload
 * is not I-JSON.
 */
export function eventSha256(event: AuditEventHashInput): string {
  // Composition stays EXPLICIT and visible at the call site: build the seventeen-key payload,
  // canonicalise it, then digest. `sha256HexUtf8` is the canonical P5-I3 helper, reused
  // UNCHANGED — it is not given JCS behaviour, audit behaviour, or any other.
  return sha256HexUtf8(canonicaliseJson(buildAuditEventHashPayloadV1(event)));
}
