/**
 * The encounter state machine over the WHOLE graph (`03` §29.1, §29.1a; D-083; `08` §11.1).
 *
 * The expectations below are transcribed from `03` §29.1 and §29.1a and import nothing from the
 * implementation's edge list, so the suite fails on drift instead of confirming that a constant
 * equals itself.
 */

import { describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import {
  CANONICAL_ENCOUNTER_TRANSITIONS,
  ENCOUNTER_INITIAL_STATUS,
  ENCOUNTER_STATUSES,
  type EncounterStatus,
  assertEncounterTransitionPermitted,
  isCanonicalEncounterTransition,
  isEncounterTransitionPermitted,
} from './encounter-state-machine.js';
import { invalidEncounterStateTransition } from './encounter-state-transition.error.js';

type Pair = readonly [EncounterStatus, EncounterStatus];

const STATUSES: readonly EncounterStatus[] = [
  'DRAFT',
  'READY_FOR_ANALYSIS',
  'ANALYSIS_IN_PROGRESS',
  'REVIEW_REQUIRED',
  'APPROVED',
  'EXPORT_PENDING',
  'EXPORTED',
  'CANCELLED',
  'CLOSED',
];

/** `03` §29.1 — the complete canonical graph. */
const EXPECTED_CANONICAL: readonly Pair[] = [
  ['DRAFT', 'READY_FOR_ANALYSIS'],
  ['DRAFT', 'CANCELLED'],
  ['READY_FOR_ANALYSIS', 'ANALYSIS_IN_PROGRESS'],
  ['READY_FOR_ANALYSIS', 'CANCELLED'],
  ['ANALYSIS_IN_PROGRESS', 'REVIEW_REQUIRED'],
  ['ANALYSIS_IN_PROGRESS', 'READY_FOR_ANALYSIS'],
  ['ANALYSIS_IN_PROGRESS', 'CANCELLED'],
  ['REVIEW_REQUIRED', 'APPROVED'],
  ['REVIEW_REQUIRED', 'ANALYSIS_IN_PROGRESS'],
  ['REVIEW_REQUIRED', 'CANCELLED'],
  ['APPROVED', 'EXPORT_PENDING'],
  ['APPROVED', 'REVIEW_REQUIRED'],
  ['EXPORT_PENDING', 'EXPORTED'],
  ['EXPORT_PENDING', 'APPROVED'],
  ['EXPORTED', 'CLOSED'],
];

/** `03` §29.1a rows 1–3 — the only edges Phase 5 permits. */
const EXPECTED_PHASE_5: readonly Pair[] = [
  ['DRAFT', 'READY_FOR_ANALYSIS'],
  ['DRAFT', 'CANCELLED'],
  ['READY_FOR_ANALYSIS', 'CANCELLED'],
];

const key = ([from, to]: Pair): string => `${from}->${to}`;

const PHASE_5_KEYS: ReadonlySet<string> = new Set(EXPECTED_PHASE_5.map(key));
const CANONICAL_KEYS: ReadonlySet<string> = new Set(EXPECTED_CANONICAL.map(key));

const ALL_PAIRS: readonly Pair[] = STATUSES.flatMap((from) =>
  STATUSES.map((to): Pair => [from, to]),
);
const FORBIDDEN_CANONICAL: readonly Pair[] = EXPECTED_CANONICAL.filter(
  (pair) => !PHASE_5_KEYS.has(key(pair)),
);
const NON_EDGES: readonly Pair[] = ALL_PAIRS.filter((pair) => !CANONICAL_KEYS.has(key(pair)));
const SAME_STATE: readonly Pair[] = STATUSES.map((status): Pair => [status, status]);

function refusalOf(from: EncounterStatus, to: EncounterStatus): unknown {
  try {
    assertEncounterTransitionPermitted(from, to);
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

function expectRefused(from: EncounterStatus, to: EncounterStatus): void {
  expect(isEncounterTransitionPermitted(from, to)).toBe(false);

  const refusal = refusalOf(from, to);

  expect(refusal).toBeInstanceOf(ApiException);
  expect(refusal).toMatchObject({
    code: 'INVALID_STATE_TRANSITION',
    status: 409,
    detail: 'The requested state transition is not permitted.',
  });
}

describe('encounter status vocabulary', () => {
  it('holds exactly the nine statuses of encounter_status, in order', () => {
    expect([...ENCOUNTER_STATUSES]).toEqual([...STATUSES]);
  });
});

describe('canonical encounter graph (03 §29.1)', () => {
  it('contains exactly 15 edges', () => {
    expect(CANONICAL_ENCOUNTER_TRANSITIONS).toHaveLength(15);
    expect(EXPECTED_CANONICAL).toHaveLength(15);
  });

  it('holds exactly the canonical edges, in document order, with no duplicates', () => {
    const actual = CANONICAL_ENCOUNTER_TRANSITIONS.map((edge): Pair => [edge.from, edge.to]);

    expect(actual).toEqual(EXPECTED_CANONICAL);
    expect(new Set(actual.map(key)).size).toBe(15);
  });

  it('classifies every ordered pair as canonical or not', () => {
    for (const [from, to] of ALL_PAIRS) {
      expect([from, to, isCanonicalEncounterTransition(from, to)]).toEqual([
        from,
        to,
        CANONICAL_KEYS.has(key([from, to])),
      ]);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(CANONICAL_ENCOUNTER_TRANSITIONS)).toBe(true);
    for (const edge of CANONICAL_ENCOUNTER_TRANSITIONS) {
      expect(Object.isFrozen(edge)).toBe(true);
    }
  });
});

describe('initialisation (D-083)', () => {
  it('creates an encounter in DRAFT', () => {
    expect(ENCOUNTER_INITIAL_STATUS).toBe('DRAFT');
  });

  it('is not one of the 15 graph edges: no edge enters DRAFT', () => {
    expect(CANONICAL_ENCOUNTER_TRANSITIONS.filter((edge) => edge.to === 'DRAFT')).toEqual([]);
    expect(STATUSES.filter((from) => isCanonicalEncounterTransition(from, 'DRAFT'))).toEqual([]);
  });
});

describe('Phase-5 reachability (03 §29.1a; D-083)', () => {
  it('flags exactly the three Phase-5 edges as reachable', () => {
    const reachable = CANONICAL_ENCOUNTER_TRANSITIONS.filter((edge) => edge.reachableInPhase5).map(
      (edge): Pair => [edge.from, edge.to],
    );

    expect(reachable).toEqual(EXPECTED_PHASE_5);
  });

  it.each(EXPECTED_PHASE_5)('permits %s -> %s', (from, to) => {
    expect(isEncounterTransitionPermitted(from, to)).toBe(true);
    expect(() => assertEncounterTransitionPermitted(from, to)).not.toThrow();
  });

  it('refuses the remaining 12 of 15 canonical edges (3 + 12 = 15)', () => {
    expect(FORBIDDEN_CANONICAL).toHaveLength(12);
    expect(EXPECTED_PHASE_5.length + FORBIDDEN_CANONICAL.length).toBe(15);
  });

  it.each(FORBIDDEN_CANONICAL)(
    'refuses canonical edge %s -> %s with INVALID_STATE_TRANSITION',
    (from, to) => {
      expect(isCanonicalEncounterTransition(from, to)).toBe(true);
      expectRefused(from, to);
    },
  );
});

describe('non-edges', () => {
  it('there are 66 ordered non-edges among the 81 pairs', () => {
    expect(ALL_PAIRS).toHaveLength(81);
    expect(NON_EDGES).toHaveLength(66);
  });

  it.each(NON_EDGES)('refuses non-edge %s -> %s with INVALID_STATE_TRANSITION', (from, to) => {
    expectRefused(from, to);
  });

  it.each(SAME_STATE)('refuses same-state pair %s -> %s', (from, to) => {
    expect(isCanonicalEncounterTransition(from, to)).toBe(false);
    expectRefused(from, to);
  });

  it('refuses READY_FOR_ANALYSIS -> READY_FOR_ANALYSIS: the intake no-op is not a state-machine no-op', () => {
    expect(isCanonicalEncounterTransition('READY_FOR_ANALYSIS', 'READY_FOR_ANALYSIS')).toBe(false);
    expectRefused('READY_FOR_ANALYSIS', 'READY_FOR_ANALYSIS');
  });

  it('refuses CANCELLED -> CLOSED', () => {
    expect(isCanonicalEncounterTransition('CANCELLED', 'CLOSED')).toBe(false);
    expectRefused('CANCELLED', 'CLOSED');
  });
});

describe('terminal statuses', () => {
  it.each(['CANCELLED', 'CLOSED'] as const)('%s has no outgoing canonical edge', (terminal) => {
    expect(CANONICAL_ENCOUNTER_TRANSITIONS.filter((edge) => edge.from === terminal)).toEqual([]);
  });

  it.each(['CANCELLED', 'CLOSED'] as const)(
    '%s has no permitted outgoing transition',
    (terminal) => {
      expect(STATUSES.filter((to) => isEncounterTransitionPermitted(terminal, to))).toEqual([]);
      for (const to of STATUSES) {
        expectRefused(terminal, to);
      }
    },
  );
});

describe('exhaustive 9 x 9 ordered pairs', () => {
  it('permits exactly 3 of 81 and refuses the other 78', () => {
    const permitted = ALL_PAIRS.filter(([from, to]) => isEncounterTransitionPermitted(from, to));
    const refused = ALL_PAIRS.filter(([from, to]) => refusalOf(from, to) !== undefined);

    expect(permitted).toEqual(EXPECTED_PHASE_5);
    expect(refused).toHaveLength(78);
    expect(permitted.length + refused.length).toBe(81);
  });

  it('answers every refusal identically', () => {
    const bodies = new Set(
      ALL_PAIRS.filter(([from, to]) => !isEncounterTransitionPermitted(from, to)).map(
        ([from, to]) => {
          const refusal = refusalOf(from, to);
          if (!(refusal instanceof ApiException)) {
            throw new Error('expected an ApiException refusal');
          }
          return JSON.stringify([
            refusal.code,
            refusal.getStatus(),
            refusal.detail,
            refusal.errors,
          ]);
        },
      ),
    );

    expect(bodies.size).toBe(1);
  });
});

describe('invalidEncounterStateTransition', () => {
  it('uses the existing catalogue code with a static detail and no field list', () => {
    const refusal = invalidEncounterStateTransition();

    expect(refusal.code).toBe('INVALID_STATE_TRANSITION');
    expect(refusal.getStatus()).toBe(409);
    expect(refusal.detail).toBe('The requested state transition is not permitted.');
    expect(refusal.errors).toBeUndefined();
  });

  it('carries no status name, identifier or row data in its detail', () => {
    const { detail } = invalidEncounterStateTransition();

    for (const status of STATUSES) {
      expect(detail).not.toContain(status);
    }
    expect(detail).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(detail).not.toMatch(/\d/);
    expect(detail).not.toMatch(/P-[0-9A-Z]{10}/);
  });
});
