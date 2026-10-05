import { describe, expect, it } from 'vitest';

import { type ApiException } from '../../common/errors/api-exception.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import {
  IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL,
  IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS,
  IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES,
  IDEMPOTENCY_SUCCESS_STATUS,
  type IdempotencyEndpoint,
  type IdempotencyScope,
} from '../idempotency.constants.js';
import { IdempotencyDatabase } from '../infrastructure/idempotency.database.js';
import {
  type IdempotencyClaim,
  type IdempotencyClaimRow,
  type IdempotencyCompletion,
} from '../infrastructure/idempotency-database.port.js';
import {
  IdempotencyResourceBindingError,
  IdempotencyService,
  type IdempotentOperation,
  type IdempotentRequest,
} from './idempotency.service.js';

/**
 * The two bounded `P5-I5D` extensions of the SHARED idempotency service (D-089 `RULING D`), and
 * the proof that every earlier caller is unaffected by them:
 *
 * 1. the success status is a CLOSED, EXHAUSTIVE map keyed by the endpoint identity — `201` for
 *    both creates, `200` for cancel — and no caller can choose it (NB-PF-3);
 * 2. `boundResourceId` — a completed claim for ANOTHER resource is `409 IDEMPOTENCY_CONFLICT`,
 *    decided from the cache alone, before the replay callback; an omitted binding changes nothing.
 *
 * Real advisory-lock contention and real rows are proven by the security suites.
 */

const TENANT: AdmittedTenantSession = Object.freeze({
  practiceId: '11111111-1111-4111-8111-111111111001',
  run: () => Promise.reject(new Error('the fake claims adapter never reaches the session')),
});

const RESOURCE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RESOURCE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

/** The claims adapter, replaced at its four methods, recording every call in order. */
class FakeClaims extends IdempotencyDatabase {
  public readonly calls: string[] = [];
  public readonly completions: IdempotencyCompletion[] = [];
  public lockAvailable = true;
  public existing: IdempotencyClaimRow | undefined;

  public override tryAdvisoryLock(): Promise<boolean> {
    this.calls.push('lock');

    return Promise.resolve(this.lockAvailable);
  }

  public override findClaim(): Promise<IdempotencyClaimRow | undefined> {
    this.calls.push('find');

    return Promise.resolve(this.existing);
  }

  public override createClaim(
    _tenant: AdmittedTenantSession,
    _claim: IdempotencyClaim,
  ): Promise<void> {
    this.calls.push('claim');

    return Promise.resolve();
  }

  public override completeClaim(
    _tenant: AdmittedTenantSession,
    completion: IdempotencyCompletion,
  ): Promise<void> {
    this.calls.push('complete');
    this.completions.push(completion);

    return Promise.resolve();
  }
}

function scope(endpoint: IdempotencyEndpoint): IdempotencyScope {
  return {
    practiceId: TENANT.practiceId,
    userId: '22222222-2222-4222-8222-222222222001',
    endpoint,
    idempotencyKey: 'key-0001',
  };
}

function request(
  endpoint: IdempotencyEndpoint,
  extra: Partial<IdempotentRequest> = {},
): IdempotentRequest {
  return {
    scope: scope(endpoint),
    requestSha256: HASH,
    claimId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    instant: new Date('2026-10-05T10:00:00.000Z'),
    ...extra,
  };
}

function completedClaim(resourceId: unknown, requestSha256 = HASH): IdempotencyClaimRow {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    requestSha256,
    responseStatus: 200,
    responseBody: { resourceId },
    completedAt: new Date('2026-10-05T09:00:00.000Z'),
  };
}

function operation(
  calls: string[],
  resourceId = RESOURCE_A,
): IdempotentOperation<{ readonly from: string; readonly id: string }> {
  return {
    execute: () => {
      calls.push('execute');

      return Promise.resolve({ resourceId, result: { from: 'execute', id: resourceId } });
    },
    replay: (id: string) => {
      calls.push(`replay(${id})`);

      return Promise.resolve({ from: 'replay', id });
    },
  };
}

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (error: unknown) => error,
  );
}

describe('IDEMPOTENCY_SUCCESS_STATUS (NB-PF-3)', () => {
  it('is exhaustive over the endpoint union and closed: two creates at 201, cancel at 200', () => {
    expect(IDEMPOTENCY_SUCCESS_STATUS).toStrictEqual({
      'POST /patient-references': 201,
      'POST /encounters': 201,
      'POST /encounters/{encounterId}/cancel': 200,
    });
    expect(Object.isFrozen(IDEMPOTENCY_SUCCESS_STATUS)).toBe(true);
  });

  it('spells the cancel endpoint as the 03 §4 TEMPLATE, never a concrete path', () => {
    expect(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL).toBe(
      'POST /encounters/{encounterId}/cancel',
    );
    expect(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL).not.toMatch(/[0-9a-f]{8}-|\/api\/v1/);
  });

  it('offers the caller no way to choose the status — the request type has no such member', () => {
    const keys: (keyof IdempotentRequest)[] = [
      'scope',
      'requestSha256',
      'claimId',
      'instant',
      'boundResourceId',
    ];

    expect(Object.keys(request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS)).sort()).toStrictEqual(
      keys.filter((key) => key !== 'boundResourceId').sort(),
    );
  });

  it.each([
    [IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES, 201],
    [IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS, 201],
    [IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL, 200],
  ] as const)('completes %s with %i', async (endpoint, status) => {
    const claims = new FakeClaims();
    const service = new IdempotencyService(claims);

    await service.runOnce(
      TENANT,
      request(
        endpoint,
        endpoint === IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL
          ? { boundResourceId: RESOURCE_A }
          : {},
      ),
      operation([]),
    );

    expect(claims.calls).toStrictEqual(['lock', 'find', 'claim', 'complete']);
    expect(claims.completions.map((completion) => completion.responseStatus)).toStrictEqual([
      status,
    ]);
  });
});

describe('IdempotencyService — unchanged behaviour without a binding (existing create callers)', () => {
  it('first execution: lock, find, claim, execute, complete with 201 and the returned resource', async () => {
    const claims = new FakeClaims();
    const calls: string[] = [];

    const result = await new IdempotencyService(claims).runOnce(
      TENANT,
      request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS),
      operation(calls, RESOURCE_B),
    );

    expect(result).toStrictEqual({ from: 'execute', id: RESOURCE_B });
    expect(calls).toStrictEqual(['execute']);
    expect(claims.completions).toMatchObject([{ responseStatus: 201, resourceId: RESOURCE_B }]);
  });

  it('replays ANY cached resource when no binding is supplied', async () => {
    const claims = new FakeClaims();
    claims.existing = completedClaim(RESOURCE_B);
    const calls: string[] = [];

    const result = await new IdempotencyService(claims).runOnce(
      TENANT,
      request(IDEMPOTENCY_ENDPOINT_POST_PATIENT_REFERENCES),
      operation(calls),
    );

    expect(result).toStrictEqual({ from: 'replay', id: RESOURCE_B });
    expect(calls).toStrictEqual([`replay(${RESOURCE_B})`]);
    expect(claims.calls).toStrictEqual(['lock', 'find']);
  });

  it('keeps the refusal order: lock unavailable -> in progress; unfinished -> in progress; other hash -> conflict', async () => {
    const locked = new FakeClaims();
    locked.lockAvailable = false;
    const unfinished = new FakeClaims();
    unfinished.existing = { ...completedClaim(RESOURCE_A, OTHER_HASH), completedAt: null };
    const otherHash = new FakeClaims();
    otherHash.existing = completedClaim(RESOURCE_A, OTHER_HASH);

    const codes: string[] = [];

    for (const claims of [locked, unfinished, otherHash]) {
      const error = await refusal(
        new IdempotencyService(claims).runOnce(
          TENANT,
          request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTERS),
          operation([]),
        ),
      );

      codes.push((error as ApiException).code);
    }

    expect(codes).toStrictEqual([
      'REQUEST_ALREADY_IN_PROGRESS',
      'REQUEST_ALREADY_IN_PROGRESS',
      'IDEMPOTENCY_CONFLICT',
    ]);
  });
});

describe('IdempotencyService — boundResourceId (D-089 RULING D)', () => {
  it('replays when the cached resource IS the bound resource', async () => {
    const claims = new FakeClaims();
    claims.existing = completedClaim(RESOURCE_A);
    const calls: string[] = [];

    const result = await new IdempotencyService(claims).runOnce(
      TENANT,
      request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL, { boundResourceId: RESOURCE_A }),
      operation(calls),
    );

    expect(result).toStrictEqual({ from: 'replay', id: RESOURCE_A });
    expect(calls).toStrictEqual([`replay(${RESOURCE_A})`]);
  });

  it('answers 409 IDEMPOTENCY_CONFLICT for a DIFFERENT cached resource, and never reaches the replay callback', async () => {
    const claims = new FakeClaims();
    claims.existing = completedClaim(RESOURCE_A);
    const calls: string[] = [];

    const error = await refusal(
      new IdempotencyService(claims).runOnce(
        TENANT,
        request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL, { boundResourceId: RESOURCE_B }),
        operation(calls),
      ),
    );

    expect([(error as ApiException).getStatus(), (error as ApiException).code]).toStrictEqual([
      409,
      'IDEMPOTENCY_CONFLICT',
    ]);
    expect(calls).toStrictEqual([]);
    expect(claims.calls).toStrictEqual(['lock', 'find']);
    expect(JSON.stringify((error as ApiException).getResponse())).not.toContain(RESOURCE_A);
  });

  it('decides an unfinished claim BEFORE the binding, and a different hash BEFORE the binding', async () => {
    const unfinished = new FakeClaims();
    unfinished.existing = { ...completedClaim(RESOURCE_A), completedAt: null };
    const otherHash = new FakeClaims();
    otherHash.existing = completedClaim(RESOURCE_A, OTHER_HASH);

    const answers: string[] = [];

    for (const claims of [unfinished, otherHash]) {
      const error = await refusal(
        new IdempotencyService(claims).runOnce(
          TENANT,
          request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL, { boundResourceId: RESOURCE_B }),
          operation([]),
        ),
      );

      answers.push((error as ApiException).code);
    }

    expect(answers).toStrictEqual(['REQUEST_ALREADY_IN_PROGRESS', 'IDEMPOTENCY_CONFLICT']);
  });

  it('compares exactly: the caller normalises, the service does not case-fold', async () => {
    const claims = new FakeClaims();
    claims.existing = completedClaim(RESOURCE_A);

    const error = await refusal(
      new IdempotencyService(claims).runOnce(
        TENANT,
        request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL, {
          boundResourceId: RESOURCE_A.toUpperCase(),
        }),
        operation([]),
      ),
    );

    expect((error as ApiException).code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('still answers 500 for an unreadable cache pointer, binding or not', async () => {
    const claims = new FakeClaims();
    claims.existing = completedClaim(42);

    const error = await refusal(
      new IdempotencyService(claims).runOnce(
        TENANT,
        request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL, { boundResourceId: RESOURCE_A }),
        operation([]),
      ),
    );

    expect([(error as ApiException).getStatus(), (error as ApiException).code]).toStrictEqual([
      500,
      'INTERNAL_ERROR',
    ]);
  });

  it('fails closed on the first execution if the operation acted on another resource — no completion', async () => {
    const claims = new FakeClaims();

    const error = await refusal(
      new IdempotencyService(claims).runOnce(
        TENANT,
        request(IDEMPOTENCY_ENDPOINT_POST_ENCOUNTER_CANCEL, { boundResourceId: RESOURCE_A }),
        operation([], RESOURCE_B),
      ),
    );

    expect(error).toBeInstanceOf(IdempotencyResourceBindingError);
    expect(claims.calls).toStrictEqual(['lock', 'find', 'claim']);
    expect(claims.completions).toStrictEqual([]);
  });
});
