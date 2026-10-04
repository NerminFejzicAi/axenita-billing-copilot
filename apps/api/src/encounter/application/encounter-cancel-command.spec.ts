import { describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import { validateEncounterCancelCommand } from './encounter-cancel-command.js';

/**
 * The cancel body gates (`P5-I5D`; D-089 `RULING E` steps 5–10, `RULING I` item 3): the closed
 * object, the required string `reason`, the raw re-read and the sanitizer — and the fact that the
 * original parsed body is never mutated, because it is what `request_sha256` is taken over.
 */

async function refusal(body: unknown): Promise<ApiException> {
  const failure = await validateEncounterCancelCommand(body).then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(ApiException);

  return failure as ApiException;
}

describe('validateEncounterCancelCommand', () => {
  it('returns the SANITISED reason for the closed body', async () => {
    await expect(
      validateEncounterCancelCommand({ reason: '  Termin\u00a0abgesagt\u0000 ' }),
    ).resolves.toStrictEqual({ reason: 'Termin abgesagt' });
  });

  it.each([
    ['a missing body', undefined],
    ['null', null],
    ['an array body', [{ reason: 'x' }]],
    ['a string body', 'reason'],
    ['a number body', 42],
  ])('answers %s 422 VALIDATION_ERROR (not an object)', async (_name, body) => {
    const error = await refusal(body);

    expect([error.getStatus(), error.code]).toStrictEqual([422, 'VALIDATION_ERROR']);
  });

  it.each([
    ['{}', {}],
    ['reason null', { reason: null }],
    ['reason a number', { reason: 1 }],
    ['reason a boolean', { reason: true }],
    ['reason an object', { reason: { text: 'x' } }],
    ['reason an array', { reason: ['x'] }],
    ['an unknown member next to a valid reason', { reason: 'ok', cancelReason: 'ok' }],
    ['an unknown member only', { status: 'CANCELLED' }],
  ])('answers %s 422 VALIDATION_ERROR at the schema gate', async (_name, body) => {
    const error = await refusal(body);

    expect([error.getStatus(), error.code]).toStrictEqual([422, 'VALIDATION_ERROR']);
  });

  it.each([
    ['empty', ''],
    ['whitespace / control only', ' \t\u0000\u0085 '],
    ['a lone surrogate', 'a\ud800b'],
    ['256 raw bytes', 'a'.repeat(256)],
    ['an NFC expansion beyond 255 bytes', '\u0958'.repeat(85)],
  ])(
    'answers a reason that fails the sanitizer (%s) with the ONE static 422',
    async (_name, reason) => {
      const error = await refusal({ reason });

      expect([error.getStatus(), error.code, error.detail, error.errors]).toStrictEqual([
        422,
        'VALIDATION_ERROR',
        'One or more fields are invalid.',
        [{ field: 'reason', code: 'INVALID_VALUE', message: 'reason is not valid' }],
      ]);
    },
  );

  it('never reflects the submitted value in any refusal', async () => {
    const marker = 'CANCEL-REASON-MARKER';

    for (const body of [
      { reason: `${marker}${'x'.repeat(300)}` },
      { reason: `${marker}\ud800` },
      { reason: marker, extra: marker },
      { reason: 7, note: marker },
    ]) {
      const error = await refusal(body);

      expect(
        JSON.stringify([error.getResponse(), error.message, error.detail, error.errors]),
      ).not.toContain(marker);
    }
  });

  it('does not mutate the parsed body - the original stays the hash input', async () => {
    const body = { reason: '  e\u0301  ' };
    const snapshot = structuredClone(body);

    await expect(validateEncounterCancelCommand(body)).resolves.toStrictEqual({
      reason: '\u00e9',
    });
    expect(body).toStrictEqual(snapshot);
    expect(Object.keys(body)).toStrictEqual(['reason']);
  });
});
