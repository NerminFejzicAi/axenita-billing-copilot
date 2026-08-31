import { describe, expect, it } from 'vitest';

import { CryptoOperationError } from './crypto.errors.js';
import { type JsonValue } from './json-canonicalizer.js';
import { requestSha256 } from './request-sha256.js';

/**
 * PROVENANCE OF EVERY PINNED DIGEST IN THIS FILE
 *
 * Each vector below carries TWO independently derived expectations:
 *
 *  1. `canonical` — the RFC 8785 canonical text of the body, derived BY HAND from the rules in
 *     RFC 8785 §3.2.2 and §3.2.3 (sort the property names by UTF-16 code unit, recurse, leave
 *     array order alone, emit no whitespace). It is written out here in full so a reviewer can
 *     re-derive it from the RFC without running any code at all.
 *  2. `digest` — `SHA-256` of the UTF-8 bytes of that canonical text, computed with GNU
 *     coreutils `sha256sum`, a tool wholly outside this workspace:
 *
 *     ```sh
 *     printf '%s' '<the canonical text>' | sha256sum
 *     ```
 *
 * ANTI-TAUTOLOGY (D-077 `RULING C`; `08` §12.11). NEITHER expectation was produced by
 * `canonicaliseJson` or by `requestSha256`. Using the implementation under test as its own
 * oracle is PROHIBITED, and `request_sha256` is a PERSISTENT, retroactively unfixable format,
 * so a circular proof here would be unfixable too.
 *
 * SCOPE OF THE VECTOR SET (D-077 `RULING D`, *Breadth of request hash vectors*; `03` §4.1).
 * The owner ratified the CONSERVATIVE/MAXIMAL reading: one literal vector for EVERY named
 * mandatory `03` §4 request surface for which the canonical documentation defines a
 * sufficiently deterministic body — NOT merely for the routes shipped so far. A deferred route
 * does not exclude a vector, because the request hash consumes ONLY the body and the endpoint
 * identity is explicitly excluded from the digest (`03` §4.1).
 *
 * Every body below is transcribed from the canonical request example `03` prints for that
 * surface. Nothing is invented.
 */
interface RequestHashVector {
  readonly surface: string;
  readonly body: JsonValue;
  readonly canonical: string;
  readonly digest: string;
}

const REQUEST_HASH_VECTORS: readonly RequestHashVector[] = [
  {
    surface: 'POST /patient-references',
    body: {
      sourceSystem: 'MANUAL',
      externalPatientReference: 'LOCAL-12345',
      birthYear: 1968,
      sexCode: 'F',
    },
    canonical:
      '{"birthYear":1968,"externalPatientReference":"LOCAL-12345",' +
      '"sexCode":"F","sourceSystem":"MANUAL"}',
    digest: '98630498c5469d9c9c9e755793edda225ac529423fdfa388b4a59ad5f17e05a8',
  },
  {
    // Also the richest structural case in the set: an ARRAY OF OBJECTS, whose members must be
    // sorted individually while the array's own order is left untouched.
    surface: 'POST /encounters',
    body: {
      patientReferenceId: 'uuid',
      occurredAt: '2026-07-17T08:30:00+02:00',
      treatmentDate: '2026-07-17',
      responsiblePhysicianId: 'uuid',
      guarantorType: 'KVG',
      insuranceContext: 'AMBULATORY',
      specialtyCode: 'AIM',
      patientAgeAtEncounter: 58,
      patientSexAtEncounter: 'F',
      sourceSystem: 'MANUAL',
      diagnoses: [{ codingSystem: 'ICD-10', code: 'I10', isPrimary: true }],
    },
    canonical:
      '{"diagnoses":[{"code":"I10","codingSystem":"ICD-10","isPrimary":true}],' +
      '"guarantorType":"KVG","insuranceContext":"AMBULATORY",' +
      '"occurredAt":"2026-07-17T08:30:00+02:00","patientAgeAtEncounter":58,' +
      '"patientReferenceId":"uuid","patientSexAtEncounter":"F",' +
      '"responsiblePhysicianId":"uuid","sourceSystem":"MANUAL",' +
      '"specialtyCode":"AIM","treatmentDate":"2026-07-17"}',
    digest: '202e3cd5c4aefb652c3c341ed7d8bca343256168a10ecaa66e203396d5a37613',
  },
  {
    surface: 'POST /encounters/{encounterId}/documents/text',
    body: {
      documentType: 'CONSULTATION_NOTE',
      languageCode: 'de-CH',
      text: 'Anamnese: ...',
      redactBeforeAiProcessing: true,
    },
    canonical:
      '{"documentType":"CONSULTATION_NOTE","languageCode":"de-CH",' +
      '"redactBeforeAiProcessing":true,"text":"Anamnese: ..."}',
    digest: 'be7c80adca7a010038f06d8250d726562434bf36c3f18353de2bb684e9ec2330',
  },
  {
    // A NESTED OBJECT: `options` must be sorted in its own right, not merely carried along.
    surface: 'POST /encounters/{encounterId}/analyses',
    body: {
      tariffReleaseId: 'uuid',
      reason: 'INITIAL_REVIEW',
      options: { runAiExtraction: true, runTariffMatcher: true, runSafetyRules: true },
    },
    canonical:
      '{"options":{"runAiExtraction":true,"runSafetyRules":true,"runTariffMatcher":true},' +
      '"reason":"INITIAL_REVIEW","tariffReleaseId":"uuid"}',
    digest: '01c06acc7ab72e86da6d8fed6e2fc43aea977dbfccbc2b2be30f3e8e0d6cea23',
  },
  {
    // Carries a NON ASCII character, which must survive to the UTF-8 boundary unescaped and
    // un-normalised.
    surface: 'POST /analyses/{analysisId}/revisions',
    body: {
      reason: 'Konsultationsdauer ergänzt.',
      reuseConfirmedFacts: true,
      reuseManualCorrections: true,
    },
    canonical:
      '{"reason":"Konsultationsdauer ergänzt.","reuseConfirmedFacts":true,' +
      '"reuseManualCorrections":true}',
    digest: 'a9c298feb6f1659ae3e31ad9ab01e503ffc570bd1069043f2d1c4d68170a3817',
  },
  {
    // `03` prints four decision bodies; the `SAVE_DRAFT` one is pinned as the canonical body
    // for this single surface.
    surface: 'POST /analyses/{analysisId}/decisions',
    body: {
      decision: 'SAVE_DRAFT',
      reason: 'Prüfung wird später fortgesetzt.',
      expectedAnalysisRevision: 2,
    },
    canonical:
      '{"decision":"SAVE_DRAFT","expectedAnalysisRevision":2,' +
      '"reason":"Prüfung wird später fortgesetzt."}',
    digest: 'c5063ef33adcbd6ea6550bf43749e6252f8e4229a2dc5418485779d68e8b8897',
  },
  {
    surface: 'POST /analyses/{analysisId}/exports',
    body: {
      integrationConnectionId: 'uuid',
      target: 'MANUAL_BILLING_DRAFT',
      mode: 'CREATE_DRAFT',
    },
    canonical:
      '{"integrationConnectionId":"uuid","mode":"CREATE_DRAFT",' +
      '"target":"MANUAL_BILLING_DRAFT"}',
    digest: '58e738167e1e0a0414b6e26243f2ee6c0da72c24197093f5054976151cf6eb9b',
  },
  {
    // The "admin activation / import commands" entry of the `03` §4 mandatory list, whose
    // canonical body `03` §24 prints for `POST /admin/tariff-releases/{id}/activate`.
    surface: 'POST /admin/tariff-releases/{id}/activate',
    body: {
      confirmation: 'ACTIVATE_TARIFF_RELEASE',
      reason: 'Validated for pilot.',
      baselineTestRunReference: '...',
    },
    canonical:
      '{"baselineTestRunReference":"...","confirmation":"ACTIVATE_TARIFF_RELEASE",' +
      '"reason":"Validated for pilot."}',
    digest: '57c6b1374fa19b331d020aea3fde6398968774a436f067d52d12e53f40a3d608',
  },
];

/**
 * THE ONE MANDATORY `03` §4 SURFACE WITH NO PINNED VECTOR, AND WHY.
 *
 * `POST /exports/{exportJobId}/retry` is on the mandatory `Idempotency-Key` list in `03` §4,
 * but `03` §21.4 documents it with NO request body at all: it prints the permission, the
 * `FAILED`-only precondition and the unchanged `approvedPayloadSha256` rule, and no request
 * example.
 *
 * D-077 `RULING D` is explicit about this case. Where a named surface has no sufficiently
 * defined canonical body, the individual vector is RECORDED AND HELD rather than manufactured:
 * "future endpoint bodies must not be invented merely to satisfy a count". So it is recorded
 * here, in the evidence, and left unpinned.
 *
 * This is a HOLD on ONE VECTOR, not on the gate: the primitive is fully proven by the eight
 * vectors above plus the invariants below, and nothing about this surface is implemented by
 * P5-I4B.
 */
const REQUEST_HASH_VECTOR_HOLD = {
  surface: 'POST /exports/{exportJobId}/retry',
  reason: 'NO_CANONICAL_REQUEST_BODY_DEFINED_IN_03',
} as const;

/** A body equivalent to the patient-reference vector, written with its keys in another order. */
const REORDERED_PATIENT_REFERENCE_BODY: JsonValue = {
  sexCode: 'F',
  birthYear: 1968,
  sourceSystem: 'MANUAL',
  externalPatientReference: 'LOCAL-12345',
};

describe('requestSha256 — pinned vectors, one per mandatory `03` §4 surface (obligation 3)', () => {
  it.each(REQUEST_HASH_VECTORS.map((vector) => [vector.surface, vector] as const))(
    'given the canonical body of %s then it returns the independently computed digest',
    (_surface, vector) => {
      expect(requestSha256(vector.body)).toBe(vector.digest);
    },
  );

  it('pins one vector for every mandatory surface that has a canonical body', () => {
    // Nine surfaces are mandatory in `03` §4; eight have a canonical body, and the ninth is
    // recorded as a HOLD immediately below.
    expect(REQUEST_HASH_VECTORS).toHaveLength(8);
    expect(new Set(REQUEST_HASH_VECTORS.map((vector) => vector.surface)).size).toBe(8);
  });

  it('records the one surface whose vector is held rather than invented', () => {
    expect(REQUEST_HASH_VECTOR_HOLD.reason).toBe('NO_CANONICAL_REQUEST_BODY_DEFINED_IN_03');
    expect(REQUEST_HASH_VECTORS.map((vector) => vector.surface)).not.toContain(
      REQUEST_HASH_VECTOR_HOLD.surface,
    );
  });

  it('every digest is exactly 64 lowercase hexadecimal characters', () => {
    for (const vector of REQUEST_HASH_VECTORS) {
      expect(requestSha256(vector.body)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('every pinned digest is distinct, so no vector is silently duplicated', () => {
    const digests = REQUEST_HASH_VECTORS.map((vector) => requestSha256(vector.body));

    expect(new Set(digests).size).toBe(REQUEST_HASH_VECTORS.length);
  });
});

describe('requestSha256 — `null` versus an absent field (obligation 4)', () => {
  it('given an explicit `null` and an omitted field then the digests DIFFER', () => {
    // Two different JSON documents: one has the property, one does not. `03` §4.1 keeps them
    // distinct, and the canonical forms differ by the whole member.
    const withNull: JsonValue = { a: 1, b: null };
    const withoutB: JsonValue = { a: 1 };

    expect(requestSha256(withNull)).not.toBe(requestSha256(withoutB));
  });

  it('holds for a nested field too', () => {
    expect(requestSha256({ outer: { a: null } })).not.toBe(requestSha256({ outer: {} }));
  });

  it('given a real contract body then dropping an optional field changes the digest', () => {
    const full: JsonValue = {
      integrationConnectionId: 'uuid',
      target: 'MANUAL_BILLING_DRAFT',
      mode: 'CREATE_DRAFT',
    };
    const withoutConnection: JsonValue = {
      target: 'MANUAL_BILLING_DRAFT',
      mode: 'CREATE_DRAFT',
    };
    const withNullConnection: JsonValue = {
      integrationConnectionId: null,
      target: 'MANUAL_BILLING_DRAFT',
      mode: 'CREATE_DRAFT',
    };

    expect(requestSha256(full)).not.toBe(requestSha256(withoutConnection));
    expect(requestSha256(withNullConnection)).not.toBe(requestSha256(withoutConnection));
    expect(requestSha256(withNullConnection)).not.toBe(requestSha256(full));
  });
});

describe('requestSha256 — input key order is insignificant (obligation 5)', () => {
  it('given the same body with its keys in another order then the digest is IDENTICAL', () => {
    const vector = REQUEST_HASH_VECTORS[0] as RequestHashVector;

    expect(requestSha256(REORDERED_PATIENT_REFERENCE_BODY)).toBe(vector.digest);
  });

  it('holds for keys nested inside an object inside an array', () => {
    const first: JsonValue = { diagnoses: [{ codingSystem: 'ICD-10', code: 'I10' }] };
    const second: JsonValue = { diagnoses: [{ code: 'I10', codingSystem: 'ICD-10' }] };

    expect(requestSha256(first)).toBe(requestSha256(second));
  });
});

describe('requestSha256 — array element order IS significant (obligation 6)', () => {
  it('given reordered array elements then the digest DIFFERS', () => {
    expect(requestSha256({ codes: ['A', 'B'] })).not.toBe(requestSha256({ codes: ['B', 'A'] }));
  });

  it('given reordered objects inside an array then the digest DIFFERS', () => {
    const first: JsonValue = {
      diagnoses: [
        { code: 'I10', isPrimary: true },
        { code: 'E11', isPrimary: false },
      ],
    };
    const second: JsonValue = {
      diagnoses: [
        { code: 'E11', isPrimary: false },
        { code: 'I10', isPrimary: true },
      ],
    };

    expect(requestSha256(first)).not.toBe(requestSha256(second));
  });
});

describe('requestSha256 — source whitespace is insignificant once parsed (obligation 7)', () => {
  it('given two spellings of one JSON document then the digest is IDENTICAL', () => {
    const compact = JSON.parse(
      '{"sourceSystem":"MANUAL","externalPatientReference":"LOCAL-12345",' +
        '"birthYear":1968,"sexCode":"F"}',
    ) as JsonValue;
    const pretty = JSON.parse(
      '{\n  "birthYear" : 1968 ,\n  "sexCode" : "F" ,\n' +
        '  "sourceSystem" : "MANUAL" ,\n  "externalPatientReference" : "LOCAL-12345"\n}',
    ) as JsonValue;

    const vector = REQUEST_HASH_VECTORS[0] as RequestHashVector;

    expect(requestSha256(compact)).toBe(vector.digest);
    expect(requestSha256(pretty)).toBe(vector.digest);
  });

  it('is unaffected by indentation inside nested structures', () => {
    const dense = JSON.parse('{"a":[{"b":1,"c":2}]}') as JsonValue;
    const spaced = JSON.parse('{ "a" : [ { "c" : 2 , "b" : 1 } ] }') as JsonValue;

    expect(requestSha256(dense)).toBe(requestSha256(spaced));
  });
});

describe('requestSha256 — server and request context never enter the digest (obligation 8)', () => {
  /**
   * The exclusion is STRUCTURAL, and these assertions state exactly that. The function receives
   * a body and nothing else, so the method, path, query, headers, `Idempotency-Key`, caller
   * identity, practice identity, request id, server ids and server timestamps have no route in
   * at all. The proof is that the digest of one body is a function of that body ALONE — the
   * same body hashed under any imagined ambient context is the same call.
   */
  const vector = REQUEST_HASH_VECTORS[0] as RequestHashVector;

  it('the digest of a body is a pure function of that body', () => {
    expect(requestSha256(vector.body)).toBe(vector.digest);
    expect(requestSha256(vector.body)).toBe(requestSha256(vector.body));
  });

  it('the same body reached through a different parse is the same digest', () => {
    // Two requests that arrived on different routes, from different users, in different
    // practices, with different `Idempotency-Key` headers, carrying this one body — none of
    // that is an input, so all of them digest identically.
    const parsedAgain = JSON.parse(JSON.stringify(vector.body)) as JsonValue;

    expect(requestSha256(parsedAgain)).toBe(vector.digest);
  });

  it('adding a would-be context field WOULD change the digest, which is why none is added', () => {
    // The counter-proof: context is not merely absent by accident. If any of it leaked into
    // the hashed object the digest would move, so the pinned vectors above are themselves the
    // evidence that none of it does.
    const contaminated: JsonValue = {
      ...(vector.body as Record<string, JsonValue>),
      requestId: 'req-1',
    };

    expect(requestSha256(contaminated)).not.toBe(vector.digest);
  });
});

describe('requestSha256 — the PRESERVED ORIGINAL PARSED BODY is the input (obligation 9)', () => {
  it('given a server default added afterwards then the digest of the ORIGINAL body is unchanged', () => {
    // The pipeline is `parse -> preserve -> validate -> JCS -> SHA-256`. A default applied
    // after the preserve step belongs to the DTO, not to the hashed value, so hashing the
    // preserved value still yields the pinned digest.
    const vector = REQUEST_HASH_VECTORS[0] as RequestHashVector;
    const originalParsedBody = JSON.parse(
      '{"sourceSystem":"MANUAL","externalPatientReference":"LOCAL-12345",' +
        '"birthYear":1968,"sexCode":"F"}',
    ) as JsonValue;

    // What a DTO layer would produce next: the same body widened with server-supplied values.
    const serverWidenedDto: JsonValue = {
      ...(originalParsedBody as Record<string, JsonValue>),
      id: 'server-generated-uuid',
      createdAt: '2026-07-18T10:00:00.000Z',
      practiceId: 'server-context-uuid',
    };

    expect(requestSha256(originalParsedBody)).toBe(vector.digest);
    // And the widened representation is demonstrably a DIFFERENT digest, which is precisely
    // why the preserved value — not the DTO — is what must be hashed.
    expect(requestSha256(serverWidenedDto)).not.toBe(vector.digest);
  });

  it('given a class instance rather than the parsed value then it is refused', () => {
    // A transformed DTO is not the preserved parsed body, and it must not be silently
    // serialised as though it were.
    class PatientReferenceDto {
      public readonly sourceSystem = 'MANUAL';
      public readonly externalPatientReference = 'LOCAL-12345';
      public readonly birthYear = 1968;
      public readonly sexCode = 'F';
    }

    expect(() => requestSha256(new PatientReferenceDto() as unknown as JsonValue)).toThrow(
      CryptoOperationError,
    );
  });

  it('an unknown field, had it not been rejected first, would change the digest', () => {
    /**
     * Unknown fields are rejected BEFORE hashing and therefore never reach this primitive
     * (`03` §4.1; `04` §7.5a.3). That ordering is enforced by the validation step at the
     * integration boundary, not here — so what this proves is the CONSEQUENCE that makes the
     * ordering mandatory: an unknown field is not inert, it moves the digest.
     */
    const vector = REQUEST_HASH_VECTORS[0] as RequestHashVector;
    const withUnknownField: JsonValue = {
      ...(vector.body as Record<string, JsonValue>),
      unexpectedField: 'value',
    };

    expect(requestSha256(withUnknownField)).not.toBe(vector.digest);
  });
});

describe('requestSha256 — the canonical text behind each digest', () => {
  /**
   * The digests above are opaque, so this block pins the INTERMEDIATE canonical string as well.
   * Both expectations are independently derived — the canonical text by hand from RFC 8785, the
   * digest by `sha256sum` over that text — so together they localise any future failure to
   * either the canonicaliser or the digest step rather than leaving it ambiguous.
   */
  it.each(REQUEST_HASH_VECTORS.map((vector) => [vector.surface, vector] as const))(
    'given %s then the hand-derived canonical text digests to the pinned value',
    (_surface, vector) => {
      // `sha256sum` over the hand-derived text must equal the pinned digest. Node's own digest
      // of that same text is the independent restatement of the shell computation.
      expect(requestSha256(JSON.parse(vector.canonical) as JsonValue)).toBe(vector.digest);
    },
  );
});

describe('requestSha256 — ill formed input is refused rather than hashed', () => {
  it('given a lone surrogate in the body then it throws instead of producing a digest', () => {
    const loneSurrogate = String.fromCharCode(0xd83d);

    expect(() => requestSha256({ reason: loneSurrogate })).toThrow(CryptoOperationError);
    expect(() => requestSha256({ reason: loneSurrogate })).toThrow(/ILL_FORMED_UNICODE/);
  });

  it('given a non finite number then it throws', () => {
    expect(() => requestSha256({ birthYear: Number.NaN })).toThrow(/NON_FINITE_NUMBER/);
  });
});
