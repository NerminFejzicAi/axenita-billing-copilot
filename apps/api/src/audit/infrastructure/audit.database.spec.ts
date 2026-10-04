import { describe, expect, it } from 'vitest';

import {
  type AdmittedTenantSession,
  type TenantStatement,
} from '../../database/tenant-statement.js';
import { AUDIT_EVENT_INSERT_STATEMENT, type AuditEventInsert } from './audit-database.port.js';
import { AuditDatabase } from './audit.database.js';

/**
 * The optional `previous_value` parameter of the append-only audit insert (`P5-I5C`; D-087
 * `OD-P5-I5C-3`): absent and `null` both bind SQL `NULL` — the behaviour every earlier caller
 * relies on — and a supplied object binds its JSON text.
 */

const EVENT: AuditEventInsert = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  practiceId: '11111111-1111-4111-8111-111111111001',
  occurredAt: new Date('2026-10-04T10:00:00.123Z'),
  actorType: 'USER',
  actorUserId: '22222222-2222-4222-8222-222222222001',
  action: 'ENCOUNTER_CREATED',
  resourceType: 'ENCOUNTER',
  resourceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  requestId: 'request-1',
  newValue: { status: 'DRAFT', version: 1 },
  metadata: {},
  eventSha256: 'a'.repeat(64),
};

async function boundValues(event: AuditEventInsert): Promise<readonly unknown[]> {
  const seen: TenantStatement[] = [];
  const tenant: AdmittedTenantSession = {
    practiceId: EVENT.practiceId,
    run: <TRow>(statement: TenantStatement): Promise<readonly TRow[]> => {
      seen.push(statement);
      return Promise.resolve([]);
    },
  };

  await new AuditDatabase().append(tenant, event);

  expect(seen.map((statement) => statement.label)).toStrictEqual([AUDIT_EVENT_INSERT_STATEMENT]);

  return seen[0]?.sql.values ?? [];
}

describe('AuditDatabase.append — previous_value', () => {
  it('binds NULL when previousValue is ABSENT (every pre-P5-I5C caller)', async () => {
    const values = await boundValues(EVENT);

    // id, practice, occurred_at, actor_type, actor_user_id, action, resource_type, resource_id,
    // request_id, new_value, metadata, event_sha256 — the twelve pre-P5-I5C positions, unchanged —
    // then PREVIOUS_VALUE, appended.
    expect(values).toHaveLength(13);
    expect(values.slice(0, 12)).toStrictEqual([
      EVENT.id,
      EVENT.practiceId,
      EVENT.occurredAt,
      'USER',
      EVENT.actorUserId,
      'ENCOUNTER_CREATED',
      'ENCOUNTER',
      EVENT.resourceId,
      'request-1',
      '{"status":"DRAFT","version":1}',
      '{}',
      'a'.repeat(64),
    ]);
    expect(values[12]).toBeNull();
  });

  it('binds NULL for an explicit null previousValue', async () => {
    expect((await boundValues({ ...EVENT, previousValue: null }))[12]).toBeNull();
  });

  it('binds the JSON text of a supplied previousValue, {} included', async () => {
    expect((await boundValues({ ...EVENT, previousValue: { guarantorType: 'KVG' } }))[12]).toBe(
      '{"guarantorType":"KVG"}',
    );
    expect((await boundValues({ ...EVENT, previousValue: {} }))[12]).toBe('{}');
  });
});
