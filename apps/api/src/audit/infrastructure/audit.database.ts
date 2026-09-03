/**
 * The audit feature adapter — ONE append-only statement, and nothing else.
 *
 * Normative sources: `02` §15.4, §19.2, §29.4a.4 and `013_rls_policies_phase5`; `04` §7.5a.2 and
 * §7.5a.3; `09` §4 and §4.2; D-063 clause 5; D-064 `OD-3`; D-069 `RULING 5`; D-072
 * `OD-P5-I4-4`; D-079 `RULING D`.
 *
 * WHERE IT RUNS
 *
 * On the ALREADY-ADMITTED pinned session, through the `TenantDatabaseService` facade — the SAME
 * transaction as the business `INSERT` it accompanies. That is the atomicity requirement of
 * `04` §7.5a.3 realised structurally: there is no second transaction to commit separately, so a
 * business row without its audit row is not merely forbidden, it is unreachable.
 *
 * FOUR COLUMNS ARE WRITTEN AS SQL `NULL` BY THIS STATEMENT AND ARE NOT PARAMETERS
 *
 *     session_id_hash        phase 5 does not collect it
 *     ip_address             phase 5 does not collect it, and NO `inet` format is invented
 *     user_agent_hash        phase 5 does not collect it
 *     previous_event_sha256  phase 5 audit is SELF-HASH ONLY (D-069 `RULING 5`)
 *
 * Two more are written as SQL `NULL` for a stronger reason still:
 *
 *     previous_value         audit minimisation — no PHI snapshot (`04` §7.5a.3)
 *     new_value              audit minimisation — no PHI snapshot
 *
 * None of the six has a parameter, so none can be set by mistake, and `previous_event_sha256` in
 * particular cannot quietly begin the event chain that D-069 `RULING 5` reserves for a later
 * governance decision. The same six are fixed at `null` inside the hash payload formatter, so the
 * hashed representation and the stored row agree by construction.
 *
 * NO `UPDATE` AND NO `DELETE` EXISTS HERE, because none exists in the grant. The class has one
 * method.
 */

import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { AUDIT_EVENT_INSERT_STATEMENT, type AuditEventInsert } from './audit-database.port.js';

/** The one row the insert returns, so a zero-row outcome would be observable. */
interface WrittenRow {
  readonly id: string;
}

@Injectable()
export class AuditDatabase {
  /**
   * Appends ONE audit event.
   *
   * @param tenant the statement surface of the ADMITTED request. `audit_events_insert` checks
   *   `practice_id = app.practice_id` independently, and the explicit bound value below is the
   *   second barrier — the application must be able to state which tenant it is writing for.
   *
   * NO `ON CONFLICT`. `audit_events.id` is an application-generated UUID and the table is
   * append-only: a unique violation here would be a UUID collision, which is an internal failure
   * rather than a routine outcome to swallow. Swallowing it would silently drop an audit row.
   *
   * `metadata` is bound as a JSON string and cast `::jsonb`, so the value travels as a BOUND
   * PARAMETER exactly like every other. No client string reaches an identifier position, and
   * there is no `Prisma.raw` and no `$queryRawUnsafe` on this path.
   */
  public async append(tenant: AdmittedTenantSession, event: AuditEventInsert): Promise<void> {
    await tenant.run<WrittenRow>({
      label: AUDIT_EVENT_INSERT_STATEMENT,
      sql: Prisma.sql`
        insert into "audit_events" (
          "id",
          "practice_id",
          "occurred_at",
          "actor_type",
          "actor_user_id",
          "actor_service",
          "action",
          "resource_type",
          "resource_id",
          "request_id",
          "session_id_hash",
          "ip_address",
          "user_agent_hash",
          "previous_value",
          "new_value",
          "metadata",
          "event_sha256",
          "previous_event_sha256"
        )
        values (
          ${event.id}::uuid,
          ${event.practiceId}::uuid,
          ${event.occurredAt}::timestamptz,
          ${event.actorType},
          ${event.actorUserId}::uuid,
          null,
          ${event.action},
          ${event.resourceType},
          ${event.resourceId}::uuid,
          ${event.requestId},
          null,
          null,
          null,
          null,
          null,
          ${JSON.stringify(event.metadata)}::jsonb,
          ${event.eventSha256},
          null
        )
        returning "id"
      `,
    });
  }
}
