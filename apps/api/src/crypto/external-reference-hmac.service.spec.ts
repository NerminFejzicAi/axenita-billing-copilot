import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { CryptoOperationError } from './crypto.errors.js';
import { buildExternalReferenceHmacMessage } from './external-reference-hmac-message.js';
import { ExternalReferenceHmacService } from './external-reference-hmac.service.js';
import {
  EXTERNAL_REFERENCE_HMAC_TOKEN_LENGTH,
  EXTERNAL_REFERENCE_HMAC_TOKEN_PATTERN,
  type ExternalReferenceIdentity,
  type HmacKeyProvider,
} from './external-reference.port.js';
import { normaliseManualV1ExternalIdentifier } from './manual-v1-identifier-normalizer.js';

/** Deterministic NON-SECRET fixture: `axenita-unit-fixture-hmac-key-32` as raw bytes. */
const FIXTURE_KEY = Buffer.from('axenita-unit-fixture-hmac-key-32', 'utf8');
const OTHER_KEY = Buffer.from('axenita-unit-fixture-hmac-key-99', 'utf8');

const PRACTICE_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER_PRACTICE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const IDENTITY: ExternalReferenceIdentity = {
  domain: 'patient_external_ref',
  practiceId: PRACTICE_ID,
  sourceSystem: 'MANUAL',
  value: 'PAT-000123',
};

function serviceWith(key: Buffer = FIXTURE_KEY): ExternalReferenceHmacService {
  const provider: HmacKeyProvider = { currentKey: (): Buffer => key };
  return new ExternalReferenceHmacService(provider);
}

describe('ExternalReferenceHmacService — the token', () => {
  it('given a canonical identity then the digest matches an independent node:crypto reference', () => {
    // The reference vector is computed here from `node:crypto` directly over the canonical
    // message, so this asserts the SERVICE agrees with the primitive rather than with itself.
    const expected = createHmac('sha256', FIXTURE_KEY)
      .update(Buffer.from(buildExternalReferenceHmacMessage(IDENTITY), 'utf8'))
      .digest('hex');

    expect(serviceWith().compute(IDENTITY)).toBe(`h1.${expected}`);
  });

  it('given a computed token then it carries the h1 generation marker and 64 lowercase hex', () => {
    const token = serviceWith().compute(IDENTITY);

    expect(token).toMatch(EXTERNAL_REFERENCE_HMAC_TOKEN_PATTERN);
    expect(token).toMatch(/^h1\.[0-9a-f]{64}$/u);
    expect(token).toHaveLength(EXTERNAL_REFERENCE_HMAC_TOKEN_LENGTH);
    expect(token).toHaveLength(67);
    expect(token.startsWith('h1.')).toBe(true);
    expect(token.slice(3)).toBe(token.slice(3).toLowerCase());
  });

  it('given the same identity and the same key then the token is deterministic', () => {
    expect(serviceWith().compute(IDENTITY)).toBe(serviceWith().compute(IDENTITY));
  });

  it('given a different key then the token changes', () => {
    expect(serviceWith(OTHER_KEY).compute(IDENTITY)).not.toBe(serviceWith().compute(IDENTITY));
  });
});

describe('ExternalReferenceHmacService — every input separates', () => {
  const service = serviceWith();
  const baseline = service.compute(IDENTITY);

  it.each([
    ['the domain', { domain: 'encounter_external_ref' } as const],
    ['the domain again', { domain: 'document_external_ref' } as const],
    ['the tenant practice id', { practiceId: OTHER_PRACTICE_ID }],
    ['the source system', { sourceSystem: 'AXENITA' } as const],
    ['the normalised identifier', { value: 'PAT-000124' }],
  ])('given a change to %s then the token changes', (_label, overrides) => {
    expect(service.compute({ ...IDENTITY, ...overrides })).not.toBe(baseline);
  });

  it('given one identifier under all three domains then all three tokens differ', () => {
    const tokens = new Set(
      (['patient_external_ref', 'encounter_external_ref', 'document_external_ref'] as const).map(
        (domain) => service.compute({ ...IDENTITY, domain }),
      ),
    );

    expect(tokens.size).toBe(3);
  });
});

describe('ExternalReferenceHmacService — MANUAL-v1 is what makes lookup work', () => {
  it('given NFC-equivalent identifiers normalised first then the token is the same', () => {
    const service = serviceWith();
    const decomposed = normaliseManualV1ExternalIdentifier(
      `  PAT-e${String.fromCharCode(0x0301)}  `,
    );
    const composed = normaliseManualV1ExternalIdentifier(`PAT-${String.fromCharCode(0x00e9)}`);

    expect(service.compute({ ...IDENTITY, value: decomposed })).toBe(
      service.compute({ ...IDENTITY, value: composed }),
    );
  });

  it('given identifiers that MANUAL-v1 keeps distinct then the tokens stay distinct', () => {
    const service = serviceWith();

    expect(
      service.compute({ ...IDENTITY, value: normaliseManualV1ExternalIdentifier('000123') }),
    ).not.toBe(service.compute({ ...IDENTITY, value: normaliseManualV1ExternalIdentifier('123') }));
  });
});

describe('ExternalReferenceHmacService — disclosure', () => {
  it('given a token then it contains no fragment of the identifier or the practice', () => {
    const token = serviceWith().compute(IDENTITY);

    expect(token).not.toContain('PAT');
    expect(token).not.toContain('000123');
    expect(token).not.toContain(PRACTICE_ID);
    expect(token).not.toContain('MANUAL');
    expect(token).not.toContain('patient_external_ref');
  });

  it('given a refused identity then no identifier or key material reaches the error', () => {
    const service = serviceWith();
    const refused = {
      ...IDENTITY,
      domain: 'invoice_external_ref',
      value: 'SECRET-PATIENT-NUMBER',
    } as unknown as ExternalReferenceIdentity;

    let thrown: unknown;
    try {
      service.compute(refused);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoOperationError);
    const error = thrown as Error;
    const serialised = `${error.message}${error.stack ?? ''}`;

    expect(serialised).not.toContain('SECRET-PATIENT-NUMBER');
    expect(serialised).not.toContain(FIXTURE_KEY.toString('utf8'));
    expect(serialised).not.toContain(FIXTURE_KEY.toString('base64'));
    expect(error.cause).toBeUndefined();
  });

  it('given the digest step failing then the underlying reason stays inside the boundary', () => {
    // A failure raised inside the crypto step is absorbed and replaced rather than wrapped or
    // chained, because its message is derived from the very material that must not leave here.
    const provider: HmacKeyProvider = {
      currentKey: (): Buffer => {
        throw new Error(`raw key material ${FIXTURE_KEY.toString('base64')}`);
      },
    };

    let thrown: unknown;
    try {
      new ExternalReferenceHmacService(provider).compute(IDENTITY);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoOperationError);
    const error = thrown as Error;

    expect(error.message).toBe('External reference token computation failed.');
    expect(error.message).not.toContain(FIXTURE_KEY.toString('base64'));
    expect(error.cause).toBeUndefined();
  });
});
