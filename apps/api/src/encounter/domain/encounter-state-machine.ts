/**
 * The encounter state machine — DOMAIN ONLY (`P5-I5A`).
 *
 * Normative sources: `03` §29 (the normative source for the state machine, D-027, D-031), §29.1
 * (the complete canonical graph), §29.1a (the Phase-5 reachable subset; D-062 part F, arithmetic
 * D-083 `OD-D083-1`); `08` §11.1 (a table-driven test over the WHOLE machine).
 *
 * THE CANONICAL GRAPH HAS EXACTLY 15 EDGES AND IS WRITTEN DOWN EXACTLY ONCE
 *
 * {@link CANONICAL_ENCOUNTER_TRANSITIONS} is the single authoritative spelling of `03` §29.1. The
 * Phase-5 reachable subset is NOT a second list: it is a flag on three of those fifteen edges, so
 * a reachable edge that is not canonical cannot be expressed at all.
 *
 * INITIALISATION IS NOT AN EDGE
 *
 * *(creation)* → `DRAFT` is the initialisation of an encounter, not one of the fifteen transitions
 * (D-083). It is represented separately, by {@link ENCOUNTER_INITIAL_STATUS}, and the guard below
 * never sees it: there is no "from" status for a row that does not exist yet.
 *
 * PHASE 5 PERMITS 3 OF 15; THE OTHER 12 ARE EXPLICITLY REFUSED, NOT SILENTLY ABSENT
 *
 * `03` §29.1a requires the twelve unreachable canonical edges to be implemented as EXPLICITLY
 * forbidden. They are therefore present in the graph and refused by the guard with the same
 * answer as every non-edge. Phase-7+ behaviour is not pulled into Phase 5.
 *
 * NO SAME-STATE PAIR IS AN EDGE — INCLUDING `READY_FOR_ANALYSIS` → `READY_FOR_ANALYSIS`
 *
 * `03` §29.1a makes a repeated document intake on a `READY_FOR_ANALYSIS` encounter a no-op. That
 * no-op belongs to the LATER document-intake command guard, which decides not to ask for a
 * transition at all. At this level the self-pair is a non-edge and is refused like the other
 * eight same-state pairs; turning it into a graph edge or a state-machine no-op would make the
 * graph disagree with §29.1.
 *
 * `CANCELLED` AND `CLOSED` ARE TERMINAL
 *
 * Neither has an outgoing canonical edge, so `CANCELLED` → `CLOSED` is refused (`03` §29.1).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *
 * It reads and writes nothing. No repository, no Prisma, no SQL, no version arithmetic, no audit
 * event and no HTTP route: the graph is application-enforced (`03` §29.1a, "Sloj sprovođenja:
 * aplikacijski") and those concerns belong to later slices.
 */

import { invalidEncounterStateTransition } from './encounter-state-transition.error.js';

/**
 * The encounter status vocabulary, in the order of the persisted `encounter_status` enum
 * (`02` §4; `prisma/schema.prisma`, `enum EncounterStatus`).
 *
 * Declared here rather than imported from the generated client so that the domain stays free of
 * any persistence dependency.
 */
export const ENCOUNTER_STATUSES = [
  'DRAFT',
  'READY_FOR_ANALYSIS',
  'ANALYSIS_IN_PROGRESS',
  'REVIEW_REQUIRED',
  'APPROVED',
  'EXPORT_PENDING',
  'EXPORTED',
  'CANCELLED',
  'CLOSED',
] as const;

export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

/**
 * The status an encounter is created in — the initialisation, NOT a graph edge (D-083).
 *
 * The only and constant creation status of Phase 5 (`03` §29.1a).
 */
export const ENCOUNTER_INITIAL_STATUS = 'DRAFT' satisfies EncounterStatus;

/** One canonical edge of `03` §29.1. */
export interface EncounterTransition {
  readonly from: EncounterStatus;
  readonly to: EncounterStatus;
  /** Whether Phase 5 permits this edge (`03` §29.1a, rows 1–3). */
  readonly reachableInPhase5: boolean;
}

/**
 * The complete canonical graph of `03` §29.1 — exactly 15 edges, in document order.
 *
 * The only three edges with `reachableInPhase5: true` are rows 1–3 of `03` §29.1a.
 */
export const CANONICAL_ENCOUNTER_TRANSITIONS: readonly EncounterTransition[] = Object.freeze(
  (
    [
      { from: 'DRAFT', to: 'READY_FOR_ANALYSIS', reachableInPhase5: true },
      { from: 'DRAFT', to: 'CANCELLED', reachableInPhase5: true },

      { from: 'READY_FOR_ANALYSIS', to: 'ANALYSIS_IN_PROGRESS', reachableInPhase5: false },
      { from: 'READY_FOR_ANALYSIS', to: 'CANCELLED', reachableInPhase5: true },

      { from: 'ANALYSIS_IN_PROGRESS', to: 'REVIEW_REQUIRED', reachableInPhase5: false },
      { from: 'ANALYSIS_IN_PROGRESS', to: 'READY_FOR_ANALYSIS', reachableInPhase5: false },
      { from: 'ANALYSIS_IN_PROGRESS', to: 'CANCELLED', reachableInPhase5: false },

      { from: 'REVIEW_REQUIRED', to: 'APPROVED', reachableInPhase5: false },
      { from: 'REVIEW_REQUIRED', to: 'ANALYSIS_IN_PROGRESS', reachableInPhase5: false },
      { from: 'REVIEW_REQUIRED', to: 'CANCELLED', reachableInPhase5: false },

      { from: 'APPROVED', to: 'EXPORT_PENDING', reachableInPhase5: false },
      { from: 'APPROVED', to: 'REVIEW_REQUIRED', reachableInPhase5: false },

      { from: 'EXPORT_PENDING', to: 'EXPORTED', reachableInPhase5: false },
      { from: 'EXPORT_PENDING', to: 'APPROVED', reachableInPhase5: false },

      { from: 'EXPORTED', to: 'CLOSED', reachableInPhase5: false },
    ] satisfies EncounterTransition[]
  ).map((edge): EncounterTransition => Object.freeze(edge)),
);

function edgeKey(from: EncounterStatus, to: EncounterStatus): string {
  return `${from}->${to}`;
}

/** Lookup over the canonical graph, built ONCE from {@link CANONICAL_ENCOUNTER_TRANSITIONS}. */
const CANONICAL_EDGES: ReadonlyMap<string, EncounterTransition> = new Map(
  CANONICAL_ENCOUNTER_TRANSITIONS.map((edge) => [edgeKey(edge.from, edge.to), edge]),
);

/** Whether `from` → `to` is one of the 15 canonical edges of `03` §29.1, in any phase. */
export function isCanonicalEncounterTransition(
  from: EncounterStatus,
  to: EncounterStatus,
): boolean {
  return CANONICAL_EDGES.has(edgeKey(from, to));
}

/**
 * Whether Phase 5 permits `from` → `to`.
 *
 * True for exactly three ordered pairs. A canonical edge that Phase 5 cannot reach, every
 * same-state pair and every other non-edge are all `false`.
 */
export function isEncounterTransitionPermitted(
  from: EncounterStatus,
  to: EncounterStatus,
): boolean {
  return CANONICAL_EDGES.get(edgeKey(from, to))?.reachableInPhase5 === true;
}

/**
 * Refuses `from` → `to` unless Phase 5 permits it, with `INVALID_STATE_TRANSITION` (`03` §29.1a).
 *
 * ONE ANSWER FOR EVERY REFUSAL. A canonical edge that is not yet reachable and a pair that is not
 * an edge at all produce the identical refusal: which of the two it was is a fact about the
 * roadmap, not something a caller needs to act on.
 */
export function assertEncounterTransitionPermitted(
  from: EncounterStatus,
  to: EncounterStatus,
): void {
  if (!isEncounterTransitionPermitted(from, to)) {
    throw invalidEncounterStateTransition();
  }
}
