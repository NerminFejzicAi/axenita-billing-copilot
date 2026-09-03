/**
 * The audit writer — `SUCCESSFUL_CREATE_ONLY`, minimised, self-hashed, in the caller's
 * transaction.
 *
 * Normative sources: `02` §15.4 and §19.2; `04` §7.5a.2 and §7.5a.3; D-069 `RULING 5`; D-072
 * `OD-P5-I4-4`; D-077 and D-078 (the `P5-I4B` format/hash basis, CONSUMED and not changed);
 * D-079 `RULING D`; `08` §12.12 obligations 14-17.
 *
 * IT CONSUMES THE `P5-I4B` PRIMITIVES BY DIRECT IMPORT, AND ADDS NO WIRING
 *
 * `buildAuditEventHashPayloadV1`, `formatAuditOccurredAt` and `eventSha256` are pure functions.
 * D-078 `OD-P5-I4B-C5` adjudicated the absence of Nest provider wiring for them `CONFORMANT` /
 * `NO GAP`, and D-079 `RULING B` reaffirms that `P5-I4C` consumes them by direct import and does
 * not introduce wiring merely to "repair" that absence. Not one line of them is modified here.
 *
 * THE MINIMISATION IS STRUCTURAL, NOT PROCEDURAL
 *
 * `previous_value` and `new_value` are not parameters of {@link PatientReferenceCreatedEvent} and
 * are not written by the statement: they are fixed SQL `NULL` in the adapter and fixed `null` in
 * the hash payload. `metadata` is built HERE from a closed literal, so the caller cannot widen
 * it. The pseudonym, `birthYear`, `sexCode`, the external reference and its HMAC therefore have
 * no route into an audit row at all — there is no field to put them in (`04` §7.5a.3).
 *
 * THE DIGEST IS TAKEN OVER THE PAYLOAD THAT DESCRIBES THE STORED ROW
 *
 * `AUDIT_EVENT_HASH_PAYLOAD_V1` is exactly seventeen keys, named for the DATABASE COLUMNS, with
 * `event_sha256` structurally excluded from its own input and `previous_event_sha256` present as
 * literal `null` (D-072 `OD-P5-I4-4`). The eleven supplied values and the six fixed `null`s are
 * the same on both sides of the boundary, which is what makes the mandatory reproduction FROM THE
 * STORED ROW (`08` §12.12 obligation 16) possible at all.
 *
 * `occurred_at` USES THE AUDIT FORMATTER AND NOT THE PUBLIC ONE. `.SSS000Z` for the hash payload,
 * `.sssZ` for the public `createdAt` wire surface — two canonical surfaces, never shared (D-073
 * format firewall). This file never imports the public projection and never calls
 * `toISOString()` itself.
 */

import { Injectable } from '@nestjs/common';

import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { eventSha256 } from '../../crypto/event-sha256.js';
import { type JsonObject } from '../../crypto/json-canonicalizer.js';
import {
  AUDIT_ACTION_PATIENT_REFERENCE_CREATED,
  AUDIT_ACTOR_TYPE_USER,
  AUDIT_RESOURCE_TYPE_PATIENT_REFERENCE,
} from '../audit.constants.js';
import { AuditDatabase } from '../infrastructure/audit.database.js';

/**
 * The complete `P5-I4` audit metadata — `{"sourceSystem":"MANUAL"}` and nothing else.
 *
 * A module-level frozen literal rather than a parameter: `04` §7.5a.3 fixes the document, and
 * `P5-I4C` accepts only `MANUAL` anyway (`OD-P5-I4-9`), so a caller-supplied metadata object
 * could only ever be wrong or wider. Frozen, so a caller cannot mutate the shared object either.
 */
const PATIENT_REFERENCE_CREATED_METADATA: JsonObject = Object.freeze({ sourceSystem: 'MANUAL' });

/** Everything ONE successful patient-reference creation contributes to the audit trail. */
export interface PatientReferenceCreatedEvent {
  /** The application-generated `audit_events.id`. */
  readonly id: string;
  /** The ADMITTED practice — the value in `app.practice_id`. */
  readonly practiceId: string;
  /** The ADMITTED user, derived from `app.user_id` upstream and never caller-supplied. */
  readonly actorUserId: string;
  /** The patient reference that was just created. */
  readonly resourceId: string;
  /** The single instant of this request — generated exactly once by the route service. */
  readonly occurredAt: Date;
  /** The `03` §3.5 correlation id, or `null` outside an HTTP request. */
  readonly requestId: string | null;
}

@Injectable()
export class AuditWriterService {
  public constructor(private readonly auditEvents: AuditDatabase) {}

  /**
   * Appends the ONE audit row a successful creation produces.
   *
   * There is exactly one call site and it sits INSIDE the business mutation, after the row has
   * genuinely been written. Every failing outcome of the create path either never reaches it or
   * is rolled back with it, which is how `SUCCESSFUL_CREATE_ONLY` is achieved without a single
   * "should I audit this?" branch.
   *
   * A failure here PROPAGATES. It is not caught, not logged-and-swallowed and not retried: the
   * caller's transaction rolls back, taking the `patient_references` row and the idempotency
   * claim with it. An audit write that could fail quietly would make the trail's completeness a
   * matter of luck (`04` §7.5a.3: "neuspjeh audita prekida poslovnu operaciju").
   */
  public async recordPatientReferenceCreated(
    tenant: AdmittedTenantSession,
    event: PatientReferenceCreatedEvent,
  ): Promise<void> {
    // The ELEVEN supplied values. The other six keys of the payload — `actor_service`,
    // `session_id_hash`, `ip_address`, `user_agent_hash`, `previous_value`, `new_value` — plus
    // `previous_event_sha256` are fixed `null` by the `P5-I4B` formatter and by the statement,
    // and neither side accepts a parameter for any of them.
    const hashInput = {
      id: event.id,
      practiceId: event.practiceId,
      occurredAt: event.occurredAt,
      actorType: AUDIT_ACTOR_TYPE_USER,
      actorUserId: event.actorUserId,
      actorService: null,
      action: AUDIT_ACTION_PATIENT_REFERENCE_CREATED,
      resourceType: AUDIT_RESOURCE_TYPE_PATIENT_REFERENCE,
      resourceId: event.resourceId,
      requestId: event.requestId,
      previousValue: null,
      newValue: null,
      metadata: PATIENT_REFERENCE_CREATED_METADATA,
    };

    await this.auditEvents.append(tenant, {
      id: event.id,
      practiceId: event.practiceId,
      occurredAt: event.occurredAt,
      actorType: AUDIT_ACTOR_TYPE_USER,
      actorUserId: event.actorUserId,
      action: AUDIT_ACTION_PATIENT_REFERENCE_CREATED,
      resourceType: AUDIT_RESOURCE_TYPE_PATIENT_REFERENCE,
      resourceId: event.resourceId,
      requestId: event.requestId,
      metadata: PATIENT_REFERENCE_CREATED_METADATA,
      // The SAME eleven values that were just written, canonicalised by the `P5-I4B` primitives
      // and hashed. The digest is computed from the payload rather than from the row object, so
      // the two cannot describe different events.
      eventSha256: eventSha256(hashInput),
    });
  }
}
