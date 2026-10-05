import { describe, expect, it } from 'vitest';

import {
  type AdmittedTenantSession,
  type TenantStatement,
} from '../../database/tenant-statement.js';
import {
  CANONICAL_ENCOUNTER_TRANSITIONS,
  ENCOUNTER_STATUSES,
} from '../domain/encounter-state-machine.js';
import {
  ENCOUNTER_CANCEL_STATEMENT,
  ENCOUNTER_CANCELLABLE_STATUSES,
  ENCOUNTER_CANCELLED_STATUS,
  type EncounterCancelUpdate,
} from './encounter-database.port.js';
import { EncounterDatabase, EncounterPatchInvariantError } from './encounter.database.js';

/**
 * `EncounterDatabase.cancelEncounter` without a database (`P5-I5D`; D-089 `RULING F`): the
 * fail-closed narrowing of the statement row, the shape of the ONE statement, and the proof that
 * the cancel guard is a subset of the UNCHANGED `P5-I5A` graph. Its real PostgreSQL behaviour —
 * the lock, the race, RLS, `clock_timestamp()` — is proven in
 * `test/phase5-encounter-cancel.security.ts`.
 */

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const ENCOUNTER = '44444444-4444-4444-8444-444444444001';

const UPDATE: EncounterCancelUpdate = {
  encounterId: ENCOUNTER,
  updatedBy: '22222222-2222-4222-8222-222222222001',
};

function tenantReturning(
  result: readonly unknown[],
  seen: TenantStatement[] = [],
): AdmittedTenantSession {
  return {
    practiceId: PRACTICE,
    run: <TRow>(statement: TenantStatement): Promise<readonly TRow[]> => {
      seen.push(statement);

      return Promise.resolve(result as readonly TRow[]);
    },
  };
}

const CANCELLED_ROW = {
  outcome: 'CANCELLED',
  id: ENCOUNTER,
  status: 'CANCELLED',
  version: 5,
  patientId: '55555555-5555-4555-8555-555555555001',
  patientPseudonym: 'P-AAAAAAAAA1',
  occurredAt: new Date('2026-07-17T06:30:00.000Z'),
  treatmentDate: '2026-07-17',
  createdAt: new Date('2026-07-17T07:00:00.000Z'),
  previousStatus: 'READY_FOR_ANALYSIS',
  previousVersion: 4,
};

const EMPTY_ROW = {
  outcome: 'NOT_FOUND',
  id: null,
  status: null,
  version: null,
  patientId: null,
  patientPseudonym: null,
  occurredAt: null,
  treatmentDate: null,
  createdAt: null,
  previousStatus: null,
  previousVersion: null,
};

async function statementOf(): Promise<TenantStatement> {
  const seen: TenantStatement[] = [];

  await new EncounterDatabase().cancelEncounter(tenantReturning([CANCELLED_ROW], seen), UPDATE);

  expect(seen).toHaveLength(1);

  return seen[0] as TenantStatement;
}

describe('EncounterDatabase.cancelEncounter — result narrowing', () => {
  it('narrows CANCELLED into the projection and the previous status / version', async () => {
    await expect(
      new EncounterDatabase().cancelEncounter(tenantReturning([CANCELLED_ROW]), UPDATE),
    ).resolves.toStrictEqual({
      outcome: 'CANCELLED',
      applied: {
        projection: {
          id: ENCOUNTER,
          status: 'CANCELLED',
          version: 5,
          patientId: '55555555-5555-4555-8555-555555555001',
          patientPseudonym: 'P-AAAAAAAAA1',
          occurredAt: new Date('2026-07-17T06:30:00.000Z'),
          treatmentDate: '2026-07-17',
          createdAt: new Date('2026-07-17T07:00:00.000Z'),
        },
        previousStatus: 'READY_FOR_ANALYSIS',
        previousVersion: 4,
      },
    });
  });

  it.each(['NOT_FOUND', 'INVALID_STATE_TRANSITION', 'INCONSISTENT'])(
    'returns %s without any row material',
    async (outcome) => {
      await expect(
        new EncounterDatabase().cancelEncounter(
          tenantReturning([
            { ...EMPTY_ROW, outcome, previousStatus: 'CANCELLED', previousVersion: 2 },
          ]),
          UPDATE,
        ),
      ).resolves.toStrictEqual({ outcome });
    },
  );

  it.each([
    ['zero rows', []],
    ['two rows', [CANCELLED_ROW, CANCELLED_ROW]],
    ['an unknown outcome', [{ ...CANCELLED_ROW, outcome: 'VERSION_CONFLICT' }]],
    ['CANCELLED without a patient pseudonym', [{ ...CANCELLED_ROW, patientPseudonym: null }]],
    ['CANCELLED without a previous status', [{ ...CANCELLED_ROW, previousStatus: null }]],
    ['CANCELLED without a previous version', [{ ...CANCELLED_ROW, previousVersion: null }]],
  ])('fails closed on %s', async (_name, rows) => {
    await expect(
      new EncounterDatabase().cancelEncounter(tenantReturning(rows), UPDATE),
    ).rejects.toBeInstanceOf(EncounterPatchInvariantError);
  });
});

describe('EncounterDatabase.cancelEncounter — the ONE statement', () => {
  it('is exactly one statement, labelled without any value', async () => {
    const statement = await statementOf();

    expect(statement.label).toBe(ENCOUNTER_CANCEL_STATEMENT);
    expect(statement.label).toBe('update encounter cancel');
  });

  it('locks the target, guards the status, bumps version and uses clock_timestamp()', async () => {
    const sql = (await statementOf()).sql.sql.replace(/\s+/g, ' ');

    expect(sql).toMatch(/with "target" as materialized \(.* for update \)/);
    expect(sql).toContain('"status" = ?::encounter_status');
    expect(sql).toContain('"version" = e."version" + 1');
    expect(sql).toContain('"updated_at" = clock_timestamp()');
    expect(sql).toContain('when t."id" is null then \'NOT_FOUND\'');
    expect(sql).toContain("then 'INVALID_STATE_TRANSITION'");
    expect(sql).not.toMatch(/\bnow\(\)|current_timestamp/i);
    expect(sql).not.toMatch(/savepoint|begin|commit/i);
    expect(sql).not.toMatch(/VERSION_CONFLICT|if-match/i);
  });

  it('assigns EXACTLY status, version, updated_by and updated_at — no reason column, nothing else', async () => {
    const sql = (await statementOf()).sql.sql;
    const setClause = sql.slice(sql.indexOf(' set'), sql.indexOf('from "target"'));
    const assigned = [...setClause.matchAll(/"([a-z_]+)"\s*=/g)].map((match) => match[1]);

    expect(assigned.sort()).toStrictEqual(['status', 'updated_at', 'updated_by', 'version']);
    expect(sql).not.toMatch(/reason/i);
  });

  it('binds the admitted practice, the id, the user, CANCELLED and BOTH cancellable statuses — never a reason', async () => {
    const values = (await statementOf()).sql.values;

    expect(values).toContain(PRACTICE);
    expect(values).toContain(ENCOUNTER);
    expect(values).toContain(UPDATE.updatedBy);
    expect(values).toContain('CANCELLED');
    for (const status of ENCOUNTER_CANCELLABLE_STATUSES) {
      expect(values).toContain(status);
    }
    expect(values.every((value) => typeof value === 'string')).toBe(true);
  });
});

describe('the cancel guard against the UNCHANGED P5-I5A graph (no state-graph mutation)', () => {
  it('names only DRAFT and READY_FOR_ANALYSIS as sources and CANCELLED as target', () => {
    expect(ENCOUNTER_CANCELLABLE_STATUSES).toStrictEqual(['DRAFT', 'READY_FOR_ANALYSIS']);
    expect(ENCOUNTER_CANCELLED_STATUS).toBe('CANCELLED');
  });

  it('is EXACTLY the set of canonical -> CANCELLED edges reachable in phase 5', () => {
    const reachableCancelSources = CANONICAL_ENCOUNTER_TRANSITIONS.filter(
      (transition) => transition.to === 'CANCELLED' && transition.reachableInPhase5,
    ).map((transition) => transition.from);

    expect([...reachableCancelSources].sort()).toStrictEqual(
      [...ENCOUNTER_CANCELLABLE_STATUSES].sort(),
    );
    for (const status of ENCOUNTER_CANCELLABLE_STATUSES) {
      expect(ENCOUNTER_STATUSES).toContain(status);
    }
  });
});
