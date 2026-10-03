import { describe, expect, expectTypeOf, it } from 'vitest';

import { EncounterStatus as PrismaEncounterStatus } from '../../generated/prisma/client.js';
import { ENCOUNTER_STATUSES, type EncounterStatus } from '../domain/encounter-state-machine.js';
import { ENCOUNTER_STATUS_BINDING_HOLDS } from './encounter.database.js';

/**
 * D-085 `OD-D085-9` — the domain `EncounterStatus` and the generated Prisma `EncounterStatus` are
 * the SAME set.
 *
 * The PRIMARY proof is compile-time: `ENCOUNTER_STATUS_BINDING_HOLDS` in the adapter only
 * type-checks while the two unions are mutually assignable, so drift fails `tsc` and the build.
 * This spec restates it at the type level and adds the runtime value check, so the binding is also
 * visible in the unit report. The domain file itself imports no Prisma.
 */
describe('EncounterStatus binding (OD-D085-9)', () => {
  it('is mutually assignable at compile time', () => {
    expectTypeOf<EncounterStatus>().toEqualTypeOf<PrismaEncounterStatus>();
    expect(ENCOUNTER_STATUS_BINDING_HOLDS).toBe(true);
  });

  it('holds the same members at runtime, in the persisted enum order', () => {
    expect(Object.values(PrismaEncounterStatus)).toStrictEqual([...ENCOUNTER_STATUSES]);
  });
});
