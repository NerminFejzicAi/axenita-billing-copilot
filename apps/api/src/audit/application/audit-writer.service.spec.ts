import { describe, expect, it } from 'vitest';

import { eventSha256 } from '../../crypto/event-sha256.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { type AuditEventInsert } from '../infrastructure/audit-database.port.js';
import { type AuditDatabase } from '../infrastructure/audit.database.js';
import { AuditWriterService } from './audit-writer.service.js';

/**
 * The `ENCOUNTER_CREATED` extension of the audit writer (D-085 `OD-D085-8`), and the proof that the
 * `PATIENT_REFERENCE_CREATED` row it already wrote is unchanged by it.
 */

const TENANT: AdmittedTenantSession = Object.freeze({
  practiceId: '11111111-1111-4111-8111-111111111001',
  run: () => Promise.resolve([]),
});

function recordingWriter(): { writer: AuditWriterService; appended: AuditEventInsert[] } {
  const appended: AuditEventInsert[] = [];
  const database: AuditDatabase = {
    append: (_tenant: AdmittedTenantSession, event: AuditEventInsert): Promise<void> => {
      appended.push(event);
      return Promise.resolve();
    },
  };

  return { writer: new AuditWriterService(database), appended };
}

const BASE = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  practiceId: '11111111-1111-4111-8111-111111111001',
  actorUserId: '22222222-2222-4222-8222-222222222001',
  resourceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  occurredAt: new Date('2026-10-04T10:00:00.123Z'),
  requestId: 'request-1',
};

describe('AuditWriterService.recordEncounterCreated', () => {
  it('writes USER / ENCOUNTER / ENCOUNTER_CREATED with new_value {status, version} and metadata {}', async () => {
    const { writer, appended } = recordingWriter();

    await writer.recordEncounterCreated(TENANT, { ...BASE, status: 'DRAFT', version: 1 });

    expect(appended).toHaveLength(1);
    const [row] = appended;
    expect(row).toStrictEqual({
      ...BASE,
      actorType: 'USER',
      action: 'ENCOUNTER_CREATED',
      resourceType: 'ENCOUNTER',
      newValue: { status: 'DRAFT', version: 1 },
      metadata: {},
      eventSha256: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
  });

  it('hashes exactly the values it writes', async () => {
    const { writer, appended } = recordingWriter();

    await writer.recordEncounterCreated(TENANT, { ...BASE, status: 'DRAFT', version: 1 });

    expect(appended[0]?.eventSha256).toBe(
      eventSha256({
        ...BASE,
        actorType: 'USER',
        actorService: null,
        action: 'ENCOUNTER_CREATED',
        resourceType: 'ENCOUNTER',
        previousValue: null,
        newValue: { status: 'DRAFT', version: 1 },
        metadata: {},
      }),
    );
  });
});

describe('AuditWriterService.recordPatientReferenceCreated (unchanged)', () => {
  it('still writes new_value null and metadata {"sourceSystem":"MANUAL"}', async () => {
    const { writer, appended } = recordingWriter();

    await writer.recordPatientReferenceCreated(TENANT, BASE);

    expect(appended[0]).toMatchObject({
      action: 'PATIENT_REFERENCE_CREATED',
      resourceType: 'PATIENT_REFERENCE',
      newValue: null,
      metadata: { sourceSystem: 'MANUAL' },
      eventSha256: eventSha256({
        ...BASE,
        actorType: 'USER',
        actorService: null,
        action: 'PATIENT_REFERENCE_CREATED',
        resourceType: 'PATIENT_REFERENCE',
        previousValue: null,
        newValue: null,
        metadata: { sourceSystem: 'MANUAL' },
      }),
    });
  });
});

describe('AuditWriterService.recordEncounterUpdated (P5-I5C, D-087 OD-P5-I5C-3)', () => {
  const PREVIOUS = { occurredAt: '2026-07-17T06:30:00.000Z', guarantorType: 'KVG' };
  const NEXT = { occurredAt: '2026-07-18T06:30:00.000Z', guarantorType: null };

  it('writes USER / ENCOUNTER / ENCOUNTER_UPDATED with the given diff and metadata {}', async () => {
    const { writer, appended } = recordingWriter();

    await writer.recordEncounterUpdated(TENANT, {
      ...BASE,
      previousValue: PREVIOUS,
      newValue: NEXT,
    });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toStrictEqual({
      ...BASE,
      actorType: 'USER',
      action: 'ENCOUNTER_UPDATED',
      resourceType: 'ENCOUNTER',
      previousValue: PREVIOUS,
      newValue: NEXT,
      metadata: {},
      eventSha256: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
  });

  it('hashes exactly the values it writes, previous_value included', async () => {
    const { writer, appended } = recordingWriter();

    await writer.recordEncounterUpdated(TENANT, { ...BASE, previousValue: {}, newValue: {} });

    expect(appended[0]?.eventSha256).toBe(
      eventSha256({
        ...BASE,
        actorType: 'USER',
        actorService: null,
        action: 'ENCOUNTER_UPDATED',
        resourceType: 'ENCOUNTER',
        previousValue: {},
        newValue: {},
        metadata: {},
      }),
    );
    // `{}` and `null` are different hashed facts: a value-no-op is NOT a missing diff.
    expect(appended[0]?.eventSha256).not.toBe(
      eventSha256({
        ...BASE,
        actorType: 'USER',
        actorService: null,
        action: 'ENCOUNTER_UPDATED',
        resourceType: 'ENCOUNTER',
        previousValue: null,
        newValue: null,
        metadata: {},
      }),
    );
  });

  it('leaves the earlier callers WITHOUT a previousValue key (persisted as NULL)', async () => {
    const { writer, appended } = recordingWriter();

    await writer.recordPatientReferenceCreated(TENANT, BASE);
    await writer.recordEncounterCreated(TENANT, { ...BASE, status: 'DRAFT', version: 1 });

    for (const row of appended) {
      expect(Object.hasOwn(row, 'previousValue')).toBe(false);
    }
  });
});
