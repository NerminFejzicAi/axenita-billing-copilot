/**
 * The single refusal of the encounter state machine (`P5-I5A`).
 *
 * Normative sources: `03` §8 (the frozen error-code catalogue), §9 (status usage), §29.1a (every
 * transition Phase 5 does not permit → `409 INVALID_STATE_TRANSITION`); D-083.
 *
 * NO NEW ERROR CODE IS INTRODUCED, AND NONE MAY BE. `INVALID_STATE_TRANSITION` already exists in
 * the frozen catalogue of `03` §8.
 *
 * THE DETAIL IS STATIC AND CARRIES NOTHING FROM THE CALL. It names no encounter, no patient, no
 * practice, no row and not even the two statuses, so the refusal is byte-identical for every
 * refused pair and nothing about the resource can reach a response or a log line (`09` §11,
 * `03` §1).
 */

import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../common/errors/api-exception.js';

/** The requested encounter status transition is not permitted (`03` §29.1a). */
export function invalidEncounterStateTransition(): ApiException {
  return new ApiException({
    code: 'INVALID_STATE_TRANSITION',
    status: HttpStatus.CONFLICT,
    detail: 'The requested state transition is not permitted.',
  });
}
