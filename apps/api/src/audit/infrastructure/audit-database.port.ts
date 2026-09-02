/**
 * The database port of the audit writer — the statement label and the append-only row.
 *
 * Normative sources: `02` §15.4, §19.2, §29.4a.4 and `013_rls_policies_phase5`
 * (`audit_events_insert`); `04` §7.5a.2 and §7.5a.3; D-063 clause 5; D-064 `OD-3`; D-069
 * `RULING 5`; D-072 `OD-P5-I4-4`; D-079 `RULING D`.
 *
 * APPEND-ONLY IS ENFORCED BY THE GRANT, AND THIS TYPE MIRRORS IT. `copilot_app` holds `SELECT`
 * and `INSERT` on `audit_events` and NOTHING ELSE — no `UPDATE`, no `DELETE`, no `TRUNCATE`, not
 * even column-level (`02` §29.4a.4). There is therefore no update payload here and no method to
 * carry one: an audit trail its own writer may rewrite is not an audit trail.
 *
 * SEVENTEEN COLUMNS EXIST; THIS TYPE NAMES THE ELEVEN THE APPLICATION SUPPLIES
 *
 * `session_id_hash`, `ip_address` and `user_agent_hash` are `NULL` in phase 5 and
 * `previous_event_sha256` is `NULL` because phase 5 audit is SELF-HASH ONLY (D-069 `RULING 5`).
 * All four are written as SQL `NULL` by the statement itself rather than accepted as parameters —
 * the same structural refusal the `P5-I4B` payload formatter already makes, so a caller cannot
 * begin an event chain this phase has not settled, and no `inet` text format is invented.
 *
 * `previous_value` AND `new_value` ARE ABSENT FROM THIS TYPE ENTIRELY. `04` §7.5a.3 fixes both at
 * `null` for `P5-I4`, and a parameter for either would be the PHI-bearing convenience snapshot
 * D-079 forbids. They are written as `NULL` by the statement, so "the audit row carries no
 * patient data" is a property of the code shape and not of the caller's discipline.
 */

import { type JsonObject } from '../../crypto/json-canonicalizer.js';

/**
 * The append-only audit insert.
 *
 * The label names WHICH statement ran and carries no value: not the actor, not the resource, not
 * the metadata and not the digest.
 */
export const AUDIT_EVENT_INSERT_STATEMENT = 'insert audit_event';

/** Everything ONE `P5-I4` audit row is given. */
export interface AuditEventInsert {
  /** `audit_events.id` — generated exactly once, hashed, and written unchanged. */
  readonly id: string;
  /**
   * The ADMITTED practice — the value in `app.practice_id`, which `audit_events_insert` checks
   * independently. Cross-practice readability of `audit_events` is categorically forbidden
   * (D-063 clause 5).
   */
  readonly practiceId: string;
  /**
   * The application instant, generated exactly ONCE and persisted as that same value.
   *
   * Never a database `now()` / `CURRENT_TIMESTAMP` substitute: the hashed representation and the
   * stored value must be the same instant, or a reproduction from the stored row could never
   * reproduce the digest (`04` §7.5a.3).
   */
  readonly occurredAt: Date;
  /** `USER` for this slice. */
  readonly actorType: string;
  /** The ADMITTED user — never a caller-supplied identity. */
  readonly actorUserId: string;
  /** `PATIENT_REFERENCE_CREATED`. */
  readonly action: string;
  /** `PATIENT_REFERENCE`. */
  readonly resourceType: string;
  /** The created patient reference. */
  readonly resourceId: string;
  /** The `03` §3.5 correlation id, or `null` outside an HTTP request. */
  readonly requestId: string | null;
  /**
   * `audit_events.metadata` — `jsonb NOT NULL`.
   *
   * For `P5-I4` it is exactly `{"sourceSystem":"MANUAL"}`. It must never carry the raw request
   * body, the raw external reference, `external_patient_ref_hash`, the pseudonym, `birthYear` or
   * `sexCode` (`04` §7.5a.3).
   */
  readonly metadata: JsonObject;
  /**
   * `SHA-256( UTF8( JCS( AUDIT_EVENT_HASH_PAYLOAD_V1 ) ) )` — 64 lowercase hex characters.
   *
   * Computed from the seventeen-key payload built out of the ten values above, and EXCLUDED from
   * its own input (D-072 `OD-P5-I4-4`).
   */
  readonly eventSha256: string;
}
