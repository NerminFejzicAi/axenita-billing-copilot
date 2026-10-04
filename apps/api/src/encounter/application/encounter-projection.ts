/**
 * The closed `201` projection of `POST /api/v1/encounters` and its strong `ETag`
 * (`03` §12; D-085 `OD-D085-5`, `OD-D085-17`).
 *
 * MEMBER BY MEMBER, never a spread: the row type already carries only the closed material, and
 * building the document explicitly means a wider row could not widen the response by accident.
 */

import { type EncounterCreatedResponseDto } from '@axenita/contracts';

import { type EncounterProjectionRow } from '../infrastructure/encounter-database.port.js';

/**
 * UTC ISO-8601, millisecond precision, terminal `Z` — `YYYY-MM-DDTHH:mm:ss.sssZ`.
 *
 * `toISOString()` renders exactly that for every instant the request validator admits (years
 * `0001..9999`), and the projection is the only place it is applied.
 */
function toPublicTimestamp(value: Date): string {
  return value.toISOString();
}

export function projectEncounterCreated(row: EncounterProjectionRow): EncounterCreatedResponseDto {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    patient: {
      id: row.patientId,
      pseudonym: row.patientPseudonym,
    },
    occurredAt: toPublicTimestamp(row.occurredAt),
    treatmentDate: row.treatmentDate,
    createdAt: toPublicTimestamp(row.createdAt),
  };
}

/**
 * The strong entity tag of an encounter representation — its `version`, quoted (`03` §12).
 *
 * Derived from the representation the caller receives, so an original create carries `"1"` and a
 * replay carries the CURRENT version of the same resource (`OD-D085-7`, `OD-D085-17`).
 */
export function encounterEntityTag(representation: EncounterCreatedResponseDto): string {
  return `"${String(representation.version)}"`;
}
