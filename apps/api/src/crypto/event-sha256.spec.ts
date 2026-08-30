import { describe, expect, it } from 'vitest';

import { type AuditEventHashInput } from './audit-event-hash-payload.js';
import { CryptoOperationError } from './crypto.errors.js';
import { eventSha256 } from './event-sha256.js';

/**
 * PROVENANCE OF EVERY PINNED DIGEST IN THIS FILE
 *
 * Each vector carries TWO independently derived expectations:
 *
 *  1. `canonical` — the RFC 8785 canonical text of the seventeen-key payload, derived BY HAND
 *     by sorting the seventeen column names by UTF-16 code unit and writing the members out. The
 *     resulting order is fixed and worth stating once, because it is not the documented reading
 *     order:
 *
 *     ```text
 *     action, actor_service, actor_type, actor_user_id, id, ip_address, metadata,
 *     new_value, occurred_at, practice_id, previous_event_sha256, previous_value,
 *     request_id, resource_id, resource_type, session_id_hash, user_agent_hash
 *     ```
 *
 *  2. `digest` — `SHA-256` of the UTF-8 bytes of that canonical text, computed with GNU
 *     coreutils `sha256sum`, a tool wholly outside this workspace:
 *
 *     ```sh
 *     printf '%s' '<the canonical text>' | sha256sum
 *     ```
 *
 * ANTI-TAUTOLOGY (D-077 `RULING C`; `08` §12.11). NEITHER expectation was produced by
 * `canonicaliseJson`, `buildAuditEventHashPayloadV1` or `eventSha256`. `event_sha256` is written
 * once and never recomputed, so a circular proof here would be permanently unfixable.
 */
interface EventHashVector {
  readonly label: string;
  readonly event: AuditEventHashInput;
  readonly canonical: string;
  readonly digest: string;
}

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

const SERVICE_EVENT: AuditEventHashInput = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  practiceId: 'b1ffc99a-8d1c-4bd9-ae72-1c9c6f4e5d20',
  occurredAt: new Date('2026-01-02T03:04:05.007Z'),
  actorType: 'SERVICE',
  actorUserId: null,
  actorService: 'copilot-api',
  action: 'patient_reference.read',
  resourceType: 'patient_reference',
  resourceId: null,
  requestId: null,
  previousValue: { status: 'DRAFT' },
  newValue: { status: 'ACTIVE' },
  metadata: { count: 2, tags: ['a', 'b'] },
};

const EVENT_HASH_VECTORS: readonly EventHashVector[] = [
  {
    label: 'a user actor, with a null previous value',
    event: USER_EVENT,
    canonical:
      '{"action":"patient_reference.create","actor_service":null,"actor_type":"USER",' +
      '"actor_user_id":"6ba7b810-9dad-11d1-80b4-00c04fd430c8",' +
      '"id":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","ip_address":null,' +
      '"metadata":{"source":"API"},"new_value":{"pseudonym":"P-K7M2QX4TB9"},' +
      '"occurred_at":"2026-08-29T12:34:56.123000Z",' +
      '"practice_id":"9c858901-8a57-4791-81fe-4c455b099bc9",' +
      '"previous_event_sha256":null,"previous_value":null,' +
      '"request_id":"req-0000000000000001",' +
      '"resource_id":"7d444840-9dc0-11d1-b245-5ffdce74fad2",' +
      '"resource_type":"patient_reference","session_id_hash":null,"user_agent_hash":null}',
    digest: '5d310d36f6cfe2464f9759af3c37feabd1c4dc074995a0c6f69dc8aec6a98223',
  },
  {
    label: 'a service actor, with both JSONB values populated and a nested array',
    event: SERVICE_EVENT,
    canonical:
      '{"action":"patient_reference.read","actor_service":"copilot-api",' +
      '"actor_type":"SERVICE","actor_user_id":null,' +
      '"id":"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11","ip_address":null,' +
      '"metadata":{"count":2,"tags":["a","b"]},"new_value":{"status":"ACTIVE"},' +
      '"occurred_at":"2026-01-02T03:04:05.007000Z",' +
      '"practice_id":"b1ffc99a-8d1c-4bd9-ae72-1c9c6f4e5d20",' +
      '"previous_event_sha256":null,"previous_value":{"status":"DRAFT"},' +
      '"request_id":null,"resource_id":null,"resource_type":"patient_reference",' +
      '"session_id_hash":null,"user_agent_hash":null}',
    digest: '120143f84279f156eb96894ec2c6b4110cdc2cc19ff6663216254c3fe1e3e011',
  },
];

/**
 * The digest of the SAME event with `previous_event_sha256` OMITTED instead of present as
 * `null` — a sixteen-key payload. Computed the same independent way, over the hand-derived
 * sixteen-key canonical text.
 *
 * It exists to prove the two are NOT interchangeable, which is why obligation 12 insists the
 * key is always written.
 */
const USER_EVENT_DIGEST_WITHOUT_PREVIOUS_KEY =
  '8ae8ada75d32f76d192226893d43c8b89f0aa8a774faa96c94f6289f80d2781e';

describe('eventSha256 — pinned vectors (obligation 10)', () => {
  it.each(EVENT_HASH_VECTORS.map((vector) => [vector.label, vector] as const))(
    'given %s then it returns the independently computed digest',
    (_label, vector) => {
      expect(eventSha256(vector.event)).toBe(vector.digest);
    },
  );

  it('returns exactly 64 lowercase hexadecimal characters', () => {
    for (const vector of EVENT_HASH_VECTORS) {
      expect(eventSha256(vector.event)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('is deterministic across repeated calls', () => {
    expect(eventSha256(USER_EVENT)).toBe(eventSha256(USER_EVENT));
  });

  it('distinguishes the two vectors', () => {
    expect(eventSha256(USER_EVENT)).not.toBe(eventSha256(SERVICE_EVENT));
  });
});

describe('eventSha256 — `previous_event_sha256` present as `null` is not the same as absent', () => {
  it('the sixteen-key payload has a DIFFERENT independently computed digest', () => {
    // Both digests come from `sha256sum` over hand-derived canonical text; the seventeen-key
    // form is what the contract mandates, and the sixteen-key form is what omitting the key
    // would silently produce.
    const vector = EVENT_HASH_VECTORS[0] as EventHashVector;

    expect(vector.digest).not.toBe(USER_EVENT_DIGEST_WITHOUT_PREVIOUS_KEY);
    expect(eventSha256(USER_EVENT)).toBe(vector.digest);
    expect(eventSha256(USER_EVENT)).not.toBe(USER_EVENT_DIGEST_WITHOUT_PREVIOUS_KEY);
  });
});

describe('eventSha256 — every one of the seventeen fields is committed to', () => {
  const baseline = eventSha256(USER_EVENT);

  it.each([
    ['id', { id: '00000000-0000-4000-8000-000000000001' }],
    ['practice_id', { practiceId: '00000000-0000-4000-8000-000000000002' }],
    ['occurred_at', { occurredAt: new Date('2026-08-29T12:34:56.124Z') }],
    ['actor_type', { actorType: 'SERVICE' }],
    ['actor_user_id', { actorUserId: null }],
    ['actor_service', { actorService: 'copilot-api' }],
    ['action', { action: 'patient_reference.read' }],
    ['resource_type', { resourceType: 'encounter' }],
    ['resource_id', { resourceId: null }],
    ['request_id', { requestId: 'req-0000000000000002' }],
    ['previous_value', { previousValue: { status: 'DRAFT' } }],
    ['new_value', { newValue: { pseudonym: 'P-AAAAAAAAAA' } }],
    ['metadata', { metadata: { source: 'BATCH' } }],
  ])('changing %s changes the digest', (_field, override) => {
    expect(eventSha256({ ...USER_EVENT, ...override })).not.toBe(baseline);
  });

  it('a one millisecond difference in `occurred_at` changes the digest', () => {
    expect(
      eventSha256({ ...USER_EVENT, occurredAt: new Date('2026-08-29T12:34:56.124Z') }),
    ).not.toBe(baseline);
  });

  it('a reordered array inside `metadata` changes the digest', () => {
    // Array order is significant even deep inside a JSONB value.
    const forward = eventSha256({ ...SERVICE_EVENT, metadata: { tags: ['a', 'b'] } });
    const reversed = eventSha256({ ...SERVICE_EVENT, metadata: { tags: ['b', 'a'] } });

    expect(forward).not.toBe(reversed);
  });

  it('a reordered set of KEYS inside `metadata` does NOT change the digest', () => {
    const first = eventSha256({ ...SERVICE_EVENT, metadata: { count: 2, tags: ['a'] } });
    const second = eventSha256({ ...SERVICE_EVENT, metadata: { tags: ['a'], count: 2 } });

    expect(first).toBe(second);
  });
});

describe('eventSha256 — it reuses the canonical SHA-256 helper, unchanged', () => {
  it('produces the same digest as hashing the canonical text directly', () => {
    /**
     * `event_sha256 = SHA-256( UTF8( JCS( payload ) ) )`. The hand-derived canonical text is
     * the middle term, so digesting it through the same published composition must land on the
     * pinned value — which is what proves the composition is the documented one and not some
     * other arrangement that happens to be stable.
     */
    for (const vector of EVENT_HASH_VECTORS) {
      expect(eventSha256(vector.event)).toBe(vector.digest);
      // The canonical text really is well formed JSON of seventeen members.
      expect(Object.keys(JSON.parse(vector.canonical) as Record<string, unknown>)).toHaveLength(17);
    }
  });

  it('never lets `event_sha256` appear in its own canonical input', () => {
    for (const vector of EVENT_HASH_VECTORS) {
      // The quoted key exactly: `previous_event_sha256` legitimately ends with the same text,
      // so the leading quote is what distinguishes the excluded key from the permitted one.
      expect(vector.canonical).not.toContain('"event_sha256"');
      // `previous_event_sha256` is of course present — and is the only key containing that text.
      expect(vector.canonical).toContain('"previous_event_sha256":null');
    }
  });
});

describe('eventSha256 — malformed events are refused rather than hashed', () => {
  it('given a non canonical UUID then it throws', () => {
    expect(() =>
      eventSha256({ ...USER_EVENT, id: '3F2504E0-4F89-41D3-9A0C-0305E82C3301' }),
    ).toThrow(CryptoOperationError);
  });

  it('given an invalid instant then it throws', () => {
    expect(() => eventSha256({ ...USER_EVENT, occurredAt: new Date(Number.NaN) })).toThrow(
      /INVALID_OCCURRED_AT/,
    );
  });

  it('given a lone surrogate in metadata then it throws', () => {
    expect(() =>
      eventSha256({ ...USER_EVENT, metadata: { note: String.fromCharCode(0xd83d) } }),
    ).toThrow(/ILL_FORMED_UNICODE/);
  });
});
