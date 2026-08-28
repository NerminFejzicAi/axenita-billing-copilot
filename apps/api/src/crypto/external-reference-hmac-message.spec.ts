import { describe, expect, it } from 'vitest';

import { CryptoOperationError } from './crypto.errors.js';
import {
  buildExternalReferenceHmacMessage,
  encodeExternalReferenceHmacMessage,
} from './external-reference-hmac-message.js';
import {
  EXTERNAL_REFERENCE_HMAC_DOMAINS,
  EXTERNAL_REFERENCE_SOURCE_SYSTEMS,
  type ExternalReferenceIdentity,
} from './external-reference.port.js';
import { normaliseManualV1ExternalIdentifier } from './manual-v1-identifier-normalizer.js';

const PRACTICE_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const IDENTITY: ExternalReferenceIdentity = {
  domain: 'patient_external_ref',
  practiceId: PRACTICE_ID,
  sourceSystem: 'MANUAL',
  value: 'PAT-000123',
};

/** Builds a message from a deliberately untyped identity, the way a JSON boundary would. */
function buildUntyped(overrides: Record<string, string>): string {
  const untyped: Record<string, string> = { ...IDENTITY, ...overrides };

  return buildExternalReferenceHmacMessage(untyped as unknown as ExternalReferenceIdentity);
}

describe('buildExternalReferenceHmacMessage — the canonical layout', () => {
  it('given a complete identity then it produces exactly the five canonical lines', () => {
    expect(buildExternalReferenceHmacMessage(IDENTITY)).toBe(
      [
        'v1',
        'domain=patient_external_ref',
        `practice_id=${PRACTICE_ID}`,
        'source_system=MANUAL',
        'value=PAT-000123',
      ].join('\n'),
    );
  });

  it('given the message when inspected then it is five LF separated lines with no trailing newline', () => {
    const message = buildExternalReferenceHmacMessage(IDENTITY);
    const lines = message.split('\n');

    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('v1');
    expect(lines[1]?.startsWith('domain=')).toBe(true);
    expect(lines[2]?.startsWith('practice_id=')).toBe(true);
    expect(lines[3]?.startsWith('source_system=')).toBe(true);
    expect(lines[4]?.startsWith('value=')).toBe(true);

    expect(message).not.toContain('\r');
    expect(message.endsWith('\n')).toBe(false);
    expect(message).not.toContain('{');
  });

  it('given the encoded message then it is the exact UTF-8 bytes of the string', () => {
    const message = buildExternalReferenceHmacMessage(IDENTITY);
    const encoded = encodeExternalReferenceHmacMessage(IDENTITY);

    expect(encoded).toStrictEqual(Buffer.from(message, 'utf8'));
    expect(encoded.toString('utf8')).toBe(message);
  });

  it('given a multibyte identifier then the encoding is UTF-8 and not Latin-1', () => {
    const value = normaliseManualV1ExternalIdentifier('PAT-é€');
    const encoded = encodeExternalReferenceHmacMessage({ ...IDENTITY, value });

    // `é` is two UTF-8 bytes and `€` is three, so the value line is four bytes longer than it
    // has characters.
    expect(encoded.length).toBe(
      Buffer.byteLength(buildExternalReferenceHmacMessage({ ...IDENTITY, value }), 'utf8'),
    );
    expect(encoded.toString('utf8')).toContain(`value=${value}`);
  });
});

describe('buildExternalReferenceHmacMessage — the closed catalogues', () => {
  it.each(EXTERNAL_REFERENCE_HMAC_DOMAINS)('given the domain %s then it is accepted', (domain) => {
    expect(buildExternalReferenceHmacMessage({ ...IDENTITY, domain })).toContain(
      `domain=${domain}`,
    );
  });

  it('given the domain catalogue then it holds exactly the three ratified domains', () => {
    expect(EXTERNAL_REFERENCE_HMAC_DOMAINS).toStrictEqual([
      'patient_external_ref',
      'encounter_external_ref',
      'document_external_ref',
    ]);
  });

  it.each(EXTERNAL_REFERENCE_SOURCE_SYSTEMS)(
    'given the source system %s then the message boundary accepts it as a canonical literal',
    (sourceSystem) => {
      // Accepting a literal is NOT a claim that a normalisation profile exists for it. This
      // slice implements MANUAL-v1 and nothing else; AXENITA, CSV, FHIR and OTHER
      // normalisation are future scope.
      expect(buildExternalReferenceHmacMessage({ ...IDENTITY, sourceSystem })).toContain(
        `source_system=${sourceSystem}`,
      );
    },
  );

  it('given the source system catalogue then it holds exactly the five frozen literals', () => {
    expect(EXTERNAL_REFERENCE_SOURCE_SYSTEMS).toStrictEqual([
      'AXENITA',
      'MANUAL',
      'CSV',
      'FHIR',
      'OTHER',
    ]);
  });
});

describe('buildExternalReferenceHmacMessage — the runtime defence boundary', () => {
  it.each([
    ['an unknown domain', { domain: 'invoice_external_ref' }],
    ['an empty domain', { domain: '' }],
  ])('given %s from an untyped caller then it is refused', (_label, overrides) => {
    expect(() => buildUntyped(overrides)).toThrow(CryptoOperationError);
    expect(() => buildUntyped(overrides)).toThrow(/domain/u);
  });

  it.each([
    ['an unknown source system', { sourceSystem: 'HL7' }],
    ['a lowercase spelling of a known literal', { sourceSystem: 'manual' }],
  ])('given %s from an untyped caller then it is refused', (_label, overrides) => {
    expect(() => buildUntyped(overrides)).toThrow(CryptoOperationError);
    expect(() => buildUntyped(overrides)).toThrow(/source system/u);
  });

  it('given the platform scope literal as the practice then it is refused', () => {
    // Unlike the encryption AAD of D-025 clause 5, this contract is TENANT ONLY. The type does
    // not advertise `SYSTEM`, and a caller that bypasses the type is refused rather than
    // silently given a platform-scope token.
    expect(() => buildUntyped({ practiceId: 'SYSTEM' })).toThrow(CryptoOperationError);
    expect(() => buildUntyped({ practiceId: 'SYSTEM' })).toThrow(/tenant scoped/u);
  });
});

describe('buildExternalReferenceHmacMessage — it normalises nothing', () => {
  it.each([
    ['outer whitespace', '  PAT-1  '],
    ['a decomposed sequence', 'PAT-é'],
    ['upper case', 'pat-1'],
    ['leading zeros', '000123'],
  ])('given a value carrying %s then it is placed into the message verbatim', (_label, value) => {
    // The builder consumes an ALREADY normalised value. Normalising again here would mean the
    // profile is applied twice for one caller and once for another.
    expect(buildExternalReferenceHmacMessage({ ...IDENTITY, value })).toBe(
      [
        'v1',
        'domain=patient_external_ref',
        `practice_id=${PRACTICE_ID}`,
        'source_system=MANUAL',
        `value=${value}`,
      ].join('\n'),
    );
  });

  it('given a practice id in upper case then it is not case folded', () => {
    const upper = PRACTICE_ID.toUpperCase();

    expect(buildExternalReferenceHmacMessage({ ...IDENTITY, practiceId: upper })).toContain(
      `practice_id=${upper}`,
    );
  });
});
