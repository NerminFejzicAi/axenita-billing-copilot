import { describe, expect, it } from 'vitest';

import { type EncounterProjectionRow } from '../infrastructure/encounter-database.port.js';
import { encounterEntityTag, projectEncounterCreated } from './encounter-projection.js';

/** D-085 `OD-D085-5`, `OD-D085-17` — the closed `201` document and its strong entity tag. */

const ROW: EncounterProjectionRow = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  status: 'DRAFT',
  version: 1,
  patientId: '9b2f1e43-6a0f-4c1d-8f3e-5d6c7b8a9e01',
  patientPseudonym: 'P-K7M2QX4TB9',
  occurredAt: new Date('2026-07-17T06:30:00.000Z'),
  treatmentDate: '2026-07-17',
  createdAt: new Date('2026-07-18T10:02:00.123Z'),
};

describe('projectEncounterCreated', () => {
  it('renders exactly the seven top-level members and the two patient members', () => {
    const document = projectEncounterCreated(ROW);

    expect(Object.keys(document).sort()).toStrictEqual(
      ['createdAt', 'id', 'occurredAt', 'patient', 'status', 'treatmentDate', 'version'].sort(),
    );
    expect(Object.keys(document.patient).sort()).toStrictEqual(['id', 'pseudonym']);
    expect(document).toStrictEqual({
      id: ROW.id,
      status: 'DRAFT',
      version: 1,
      patient: { id: ROW.patientId, pseudonym: 'P-K7M2QX4TB9' },
      occurredAt: '2026-07-17T06:30:00.000Z',
      treatmentDate: '2026-07-17',
      createdAt: '2026-07-18T10:02:00.123Z',
    });
  });

  it('renders both instants as UTC with millisecond precision and a Z suffix', () => {
    const document = projectEncounterCreated({
      ...ROW,
      occurredAt: new Date('2026-07-17T08:30:00+02:00'),
    });

    expect(document.occurredAt).toBe('2026-07-17T06:30:00.000Z');
    expect(document.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('encounterEntityTag', () => {
  it('is the quoted version — "1" for a new encounter', () => {
    expect(encounterEntityTag(projectEncounterCreated(ROW))).toBe('"1"');
    expect(encounterEntityTag(projectEncounterCreated({ ...ROW, version: 4 }))).toBe('"4"');
  });
});
