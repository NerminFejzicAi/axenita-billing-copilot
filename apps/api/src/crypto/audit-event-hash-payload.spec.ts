import { describe, expect, it } from 'vitest';

import {
  type AuditEventHashInput,
  buildAuditEventHashPayloadV1,
  formatAuditOccurredAt,
} from './audit-event-hash-payload.js';
import { CryptoOperationError } from './crypto.errors.js';

/**
 * The seventeen keys `AUDIT_EVENT_HASH_PAYLOAD_V1` must carry, transcribed from D-072
 * `OD-P5-I4-4` / D-077 `RULING E` / `04` §7.5a.2 — the `audit_events` column names, with
 * `event_sha256` excluded.
 */
const CANONICAL_SEVENTEEN_KEYS = [
  'id',
  'practice_id',
  'occurred_at',
  'actor_type',
  'actor_user_id',
  'actor_service',
  'action',
  'resource_type',
  'resource_id',
  'request_id',
  'session_id_hash',
  'ip_address',
  'user_agent_hash',
  'previous_value',
  'new_value',
  'metadata',
  'previous_event_sha256',
] as const;

/** A representative user-actor event. */
const USER_EVENT: AuditEventHashInput = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  practiceId: '9c858901-8a57-4791-81fe-4c455b099bc9',
  occurredAt: new Date('2026-08-29T12:34:56.123Z'),
  actorType: 'USER',
  actorUserId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  actorService: null,
  action: 'patient_reference.create',
  resourceType: 'patient_reference',
  resourceId: '7d444840-9dc0-11d1-b245-5ffdce74fad2',
  requestId: 'req-0000000000000001',
  previousValue: null,
  newValue: { pseudonym: 'P-K7M2QX4TB9' },
  metadata: { source: 'API' },
};

describe('buildAuditEventHashPayloadV1 — exactly seventeen keys (obligation 11)', () => {
  const payload = buildAuditEventHashPayloadV1(USER_EVENT);

  it('carries exactly seventeen keys', () => {
    expect(Object.keys(payload)).toHaveLength(17);
    expect(CANONICAL_SEVENTEEN_KEYS).toHaveLength(17);
  });

  it('carries exactly the canonical seventeen — no eighteenth, none missing', () => {
    expect(new Set(Object.keys(payload))).toEqual(new Set(CANONICAL_SEVENTEEN_KEYS));
  });

  it('uses DATABASE COLUMN NAMES, never the application camelCase spellings', () => {
    for (const key of Object.keys(payload)) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    }

    for (const camelCase of [
      'practiceId',
      'occurredAt',
      'actorType',
      'actorUserId',
      'actorService',
      'resourceType',
      'resourceId',
      'requestId',
      'previousValue',
      'newValue',
      'previousEventSha256',
    ]) {
      expect(payload).not.toHaveProperty(camelCase);
    }
  });

  it('EXCLUDES `event_sha256` from its own hash input', () => {
    expect(payload).not.toHaveProperty('event_sha256');
    expect(Object.keys(payload)).not.toContain('event_sha256');
  });

  it('cannot be given an `event_sha256` to include, because the input has no such field', () => {
    // The exclusion is structural, not a filter: a caller who tries to supply one is rejected
    // by the type, and the extra property never reaches the payload.
    const withDigest = {
      ...USER_EVENT,
      eventSha256: 'f'.repeat(64),
      event_sha256: 'f'.repeat(64),
    } as AuditEventHashInput;

    const built = buildAuditEventHashPayloadV1(withDigest);

    expect(Object.keys(built)).toHaveLength(17);
    expect(built).not.toHaveProperty('event_sha256');
    expect(built).not.toHaveProperty('eventSha256');
  });
});

describe('buildAuditEventHashPayloadV1 — `previous_event_sha256` (obligation 12)', () => {
  it('is PRESENT and is `null`', () => {
    const payload = buildAuditEventHashPayloadV1(USER_EVENT);

    expect('previous_event_sha256' in payload).toBe(true);
    expect(payload.previous_event_sha256).toBeNull();
  });

  it('is never omitted, for any event', () => {
    const events: readonly AuditEventHashInput[] = [
      USER_EVENT,
      { ...USER_EVENT, actorUserId: null, actorService: 'copilot-api', actorType: 'SERVICE' },
      { ...USER_EVENT, resourceId: null, requestId: null },
    ];

    for (const event of events) {
      expect('previous_event_sha256' in buildAuditEventHashPayloadV1(event)).toBe(true);
    }
  });

  it('phase 5 is SELF-HASH ONLY — no chain predecessor can be supplied', () => {
    // D-069 `RULING 5` defers chaining entirely. The formatter has no parameter for a
    // predecessor, so P5-I4B cannot invent the chain even by accident.
    const withPredecessor = {
      ...USER_EVENT,
      previousEventSha256: 'a'.repeat(64),
    } as AuditEventHashInput;

    expect(buildAuditEventHashPayloadV1(withPredecessor).previous_event_sha256).toBeNull();
  });
});

describe('buildAuditEventHashPayloadV1 — `occurred_at` is `.SSS000Z` (obligation 13)', () => {
  it('renders six fractional digits whose last three are literally `000`', () => {
    const payload = buildAuditEventHashPayloadV1(USER_EVENT);

    expect(payload.occurred_at).toBe('2026-08-29T12:34:56.123000Z');
  });

  it.each([
    ['2026-08-29T12:34:56.123Z', '2026-08-29T12:34:56.123000Z'],
    ['2026-01-02T03:04:05.007Z', '2026-01-02T03:04:05.007000Z'],
    ['2026-12-31T23:59:59.999Z', '2026-12-31T23:59:59.999000Z'],
    ['2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000000Z'],
  ])('given %s then it formats as %s', (instant, expected) => {
    expect(formatAuditOccurredAt(new Date(instant))).toBe(expected);
  });

  it('always matches the canonical shape', () => {
    const canonicalShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}000Z$/;

    expect(formatAuditOccurredAt(new Date('2026-08-29T12:34:56.123Z'))).toMatch(canonicalShape);
    expect(formatAuditOccurredAt(new Date(0))).toMatch(canonicalShape);
  });

  it('is UTC, with a capital terminal `Z` and never a `+00:00` offset', () => {
    // A local-time instant still renders in UTC: the same moment, expressed canonically.
    const formatted = formatAuditOccurredAt(new Date('2026-07-17T08:30:00+02:00'));

    expect(formatted).toBe('2026-07-17T06:30:00.000000Z');
    expect(formatted.endsWith('Z')).toBe(true);
    expect(formatted).not.toContain('+00:00');
  });

  it('is NOT the D-073 patient-reference `.sssZ` wire formatter', () => {
    // The format firewall. `03` §11 / D-073 keep the public `createdAt` at THREE fractional
    // digits; the audit hash surface uses SIX. Sharing one formatter between them would break
    // one of the two contracts silently.
    const instant = new Date('2026-08-29T12:34:56.123Z');

    expect(formatAuditOccurredAt(instant)).toBe('2026-08-29T12:34:56.123000Z');
    expect(instant.toISOString()).toBe('2026-08-29T12:34:56.123Z');
    expect(formatAuditOccurredAt(instant)).not.toBe(instant.toISOString());
  });

  it('given an unrepresentable instant then it is refused rather than clamped', () => {
    expect(() => formatAuditOccurredAt(new Date(Number.NaN))).toThrow(CryptoOperationError);
    expect(() => formatAuditOccurredAt(new Date(Number.NaN))).toThrow(/INVALID_OCCURRED_AT/);
    // A year outside the four-digit range widens the ISO form and is refused too.
    expect(() => formatAuditOccurredAt(new Date(8.64e15))).toThrow(/INVALID_OCCURRED_AT/);
  });
});

describe('buildAuditEventHashPayloadV1 — UUID representation (obligation 14)', () => {
  it('carries lowercase canonical hyphenated UUID strings', () => {
    const payload = buildAuditEventHashPayloadV1(USER_EVENT);
    const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    expect(payload.id).toMatch(canonicalUuid);
    expect(payload.practice_id).toMatch(canonicalUuid);
    expect(payload.actor_user_id).toMatch(canonicalUuid);
    expect(payload.resource_id).toMatch(canonicalUuid);
  });

  it('renders nullable UUID columns as JSON `null`', () => {
    const payload = buildAuditEventHashPayloadV1({
      ...USER_EVENT,
      actorUserId: null,
      resourceId: null,
    });

    expect(payload.actor_user_id).toBeNull();
    expect(payload.resource_id).toBeNull();
  });

  it('REFUSES a non canonical UUID rather than repairing it', () => {
    // Lowercasing an uppercase input would silently change permanent hash material.
    expect(() =>
      buildAuditEventHashPayloadV1({ ...USER_EVENT, id: '3F2504E0-4F89-41D3-9A0C-0305E82C3301' }),
    ).toThrow(/NON_CANONICAL_UUID/);

    expect(() =>
      buildAuditEventHashPayloadV1({
        ...USER_EVENT,
        practiceId: '9c8589018a57479181fe4c455b099bc9',
      }),
    ).toThrow(/NON_CANONICAL_UUID/);

    expect(() => buildAuditEventHashPayloadV1({ ...USER_EVENT, resourceId: 'not-a-uuid' })).toThrow(
      CryptoOperationError,
    );
  });

  it('does not treat `request_id` as a UUID, because its column is `varchar(100)`', () => {
    const payload = buildAuditEventHashPayloadV1({ ...USER_EVENT, requestId: 'req-abc-123' });

    expect(payload.request_id).toBe('req-abc-123');
  });
});

describe('buildAuditEventHashPayloadV1 — JSONB columns stay JSON values (obligation 15)', () => {
  it('carries `previous_value`, `new_value` and `metadata` as VALUES, not JSON strings', () => {
    const payload = buildAuditEventHashPayloadV1({
      ...USER_EVENT,
      previousValue: { status: 'DRAFT' },
      newValue: { status: 'ACTIVE' },
      metadata: { count: 2, tags: ['a', 'b'] },
    });

    expect(payload.previous_value).toEqual({ status: 'DRAFT' });
    expect(payload.new_value).toEqual({ status: 'ACTIVE' });
    expect(payload.metadata).toEqual({ count: 2, tags: ['a', 'b'] });

    expect(typeof payload.previous_value).toBe('object');
    expect(typeof payload.new_value).toBe('object');
    expect(typeof payload.metadata).toBe('object');
  });

  it('renders nullable JSONB columns as `null`', () => {
    const payload = buildAuditEventHashPayloadV1(USER_EVENT);

    expect(payload.previous_value).toBeNull();
  });
});

describe('buildAuditEventHashPayloadV1 — phase 5 telemetry is `null` (obligation 16)', () => {
  it('fixes `session_id_hash`, `ip_address` and `user_agent_hash` to `null`', () => {
    const payload = buildAuditEventHashPayloadV1(USER_EVENT);

    expect(payload.session_id_hash).toBeNull();
    expect(payload.ip_address).toBeNull();
    expect(payload.user_agent_hash).toBeNull();
  });

  it('invents no `inet` text serialisation, because there is no way to supply an address', () => {
    const withAddress = { ...USER_EVENT, ipAddress: '198.51.100.7' } as AuditEventHashInput;

    expect(buildAuditEventHashPayloadV1(withAddress).ip_address).toBeNull();
  });
});

describe('buildAuditEventHashPayloadV1 — the payload is plain, hashable JSON', () => {
  it('holds no `undefined`, so no key can vanish from the hash material', () => {
    const payload = buildAuditEventHashPayloadV1(USER_EVENT);

    for (const key of CANONICAL_SEVENTEEN_KEYS) {
      expect(payload[key]).not.toBeUndefined();
    }
  });

  it('is a plain object the canonicaliser will accept', () => {
    expect(Object.getPrototypeOf(buildAuditEventHashPayloadV1(USER_EVENT))).toBe(Object.prototype);
  });
});
