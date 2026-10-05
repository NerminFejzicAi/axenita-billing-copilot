/**
 * Turns an untrusted parsed body of `POST /api/v1/encounters/{encounterId}/cancel` into the
 * sanitised cancel command.
 *
 * Normative sources: `03` §8, §12 (the D-089 frozen contract); D-089 `RULING E` steps 5–10 and
 * `RULING G`.
 *
 * FOUR GATES, IN THIS ORDER, ALL BEFORE THE REQUEST HASH AND BEFORE ANY STATEMENT:
 *
 * 1. ROOT SHAPE — a non-null, non-array object, else `422` (an absent body included);
 * 2. SCHEMA — the delayed `ValidationPipe` with the shared frozen options: exactly
 *    `{"reason": "<string>"}`; `{}`, an unknown member, an absent / `null` / non-string `reason`
 *    are all `422`;
 * 3. RE-READ — the transformed instance is DISCARDED and `reason` is read from the raw parsed
 *    body, so the value judged is the value the caller sent and the body that is hashed afterwards
 *    is the untouched original;
 * 4. SANITIZE — the canonical profile of `encounter-cancel-reason.ts` (well-formedness, raw byte
 *    limit, NFC, Cc, White_Space, boundary trim, final limits), else the static `422`.
 *
 * The raw `reason` is held only for the duration of this function. Neither it nor the sanitised
 * value is logged or placed in an error.
 */

import { ValidationPipe } from '@nestjs/common';

import { API_VALIDATION_PIPE_OPTIONS } from '../../common/validation/validation-pipe-options.js';
import { CancelEncounterDto } from '../dto/cancel-encounter.dto.js';
import {
  cancelReasonInvalid,
  encounterUpdateFailed,
  requestBodyNotAnObject,
} from '../encounter.errors.js';
import { sanitizeCancelReason } from './encounter-cancel-reason.js';

/** The same configuration as the global pipe, built from the same frozen constant. */
const cancelBodyValidator = new ValidationPipe(API_VALIDATION_PIPE_OPTIONS);

/** The validated cancel command — the SANITISED reason, which only the audit metadata receives. */
export interface ValidatedEncounterCancelCommand {
  readonly reason: string;
}

export async function validateEncounterCancelCommand(
  body: unknown,
): Promise<ValidatedEncounterCancelCommand> {
  // Gate 1.
  if (!isPlainObject(body)) {
    throw requestBodyNotAnObject();
  }

  // Gate 2. Throws the repository's standard `422 VALIDATION_ERROR` document, which carries no
  // submitted value (`validationError.value = false`). The result is deliberately discarded.
  await cancelBodyValidator.transform(body, { type: 'body', metatype: CancelEncounterDto });

  // Gate 3.
  const raw = body['reason'];

  if (typeof raw !== 'string') {
    // UNREACHABLE over HTTP: gate 2 proved this. Reaching here means the gates disagree, which is
    // a defect in this file — so it becomes the shared static `500`, never a guessed value.
    throw encounterUpdateFailed();
  }

  // Gate 4.
  const reason = sanitizeCancelReason(raw);

  if (reason === undefined) {
    throw cancelReasonInvalid();
  }

  return { reason };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
