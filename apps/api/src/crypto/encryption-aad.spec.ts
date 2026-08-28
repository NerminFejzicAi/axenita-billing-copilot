import { describe, expect, it } from 'vitest';

import { buildEncryptionAad, encodeEncryptionAad } from './encryption-aad.js';
import { SYSTEM_SCOPE_PRACTICE_ID, type EncryptionAad } from './encryption.port.js';

const TENANT_AAD: EncryptionAad = {
  practiceId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  table: 'patient_references',
  rowId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  column: 'display_name_ciphertext',
  envelopeVersion: 1,
};

/**
 * The canonical AAD of D-025 clause 5, written out literally.
 *
 * Deliberately NOT built from the same helper it verifies: an expectation derived from the
 * implementation would agree with any regression the implementation contains. These two strings
 * are the contract, and a diff against them is a diff against every ciphertext ever stored.
 */
const EXPECTED_TENANT_AAD =
  'v1\n' +
  'practice_id=3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d\n' +
  'table=patient_references\n' +
  'row_id=9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d\n' +
  'column=display_name_ciphertext\n' +
  'envelope_version=1';

const EXPECTED_SYSTEM_AAD =
  'v1\n' +
  'practice_id=SYSTEM\n' +
  'table=external_resource_links\n' +
  'row_id=11112222-3333-4444-5555-666677778888\n' +
  'column=target_reference_ciphertext\n' +
  'envelope_version=1';

describe('buildEncryptionAad', () => {
  it('given a tenant scoped field when built then the canonical D-025 string is produced', () => {
    expect(buildEncryptionAad(TENANT_AAD)).toBe(EXPECTED_TENANT_AAD);
  });

  it('given a platform scoped field when built then the practice line is the SYSTEM literal', () => {
    const aad = buildEncryptionAad({
      practiceId: SYSTEM_SCOPE_PRACTICE_ID,
      table: 'external_resource_links',
      rowId: '11112222-3333-4444-5555-666677778888',
      column: 'target_reference_ciphertext',
      envelopeVersion: 1,
    });

    expect(aad).toBe(EXPECTED_SYSTEM_AAD);
  });

  it('given any input when built then separators are LF and there is no CR', () => {
    const aad = buildEncryptionAad(TENANT_AAD);

    expect(aad.split('\n')).toHaveLength(6);
    expect(aad).not.toContain('\r');
  });

  it('given any input when built then there is no trailing newline', () => {
    const aad = buildEncryptionAad(TENANT_AAD);

    expect(aad.endsWith('\n')).toBe(false);
    expect(aad.endsWith('envelope_version=1')).toBe(true);
  });

  it('given any input when built then the six lines keep their canonical order', () => {
    expect(
      buildEncryptionAad(TENANT_AAD)
        .split('\n')
        .map((line) => line.split('=')[0]),
    ).toStrictEqual(['v1', 'practice_id', 'table', 'row_id', 'column', 'envelope_version']);
  });

  it('given the AAD line name when built then it is envelope_version, not encryption_version', () => {
    // The persisted column is `encryption_version`; the AAD line is `envelope_version`
    // (D-025 clauses 3 and 5). The two names are not interchangeable, because one of them is
    // authenticated bytes.
    const aad = buildEncryptionAad(TENANT_AAD);

    expect(aad).toContain('envelope_version=1');
    expect(aad).not.toContain('encryption_version');
  });

  it.each([
    ['practiceId', { practiceId: '00000000-0000-4000-8000-000000000001' }],
    ['table', { table: 'encounters' }],
    ['rowId', { rowId: '00000000-0000-4000-8000-000000000002' }],
    ['column', { column: 'chief_complaint_ciphertext' }],
    ['envelopeVersion', { envelopeVersion: 2 }],
  ])('given a changed %s when built then the AAD changes', (_label, override) => {
    expect(buildEncryptionAad({ ...TENANT_AAD, ...override })).not.toBe(EXPECTED_TENANT_AAD);
  });

  it('given two locations differing only in column when built then the AADs differ', () => {
    // The whole point of clause 5: a ciphertext moved between columns of the SAME row must
    // stop decrypting, which is a control RLS cannot provide.
    const first = buildEncryptionAad(TENANT_AAD);
    const second = buildEncryptionAad({ ...TENANT_AAD, column: 'date_of_birth_ciphertext' });

    expect(first).not.toBe(second);
  });
});

describe('encodeEncryptionAad', () => {
  it('given a canonical AAD when encoded then the bytes are exactly its UTF-8 form', () => {
    const encoded = encodeEncryptionAad(TENANT_AAD);

    expect(encoded).toStrictEqual(Buffer.from(EXPECTED_TENANT_AAD, 'utf8'));
    expect(encoded.toString('utf8')).toBe(EXPECTED_TENANT_AAD);
  });

  it('given non-ASCII values when encoded then UTF-8 bytes are produced, not code units', () => {
    // A column or table name is ASCII today, but the encoding is part of the stored format and
    // is asserted rather than assumed: latin1 or UTF-16 would silently change every AAD.
    const encoded = encodeEncryptionAad({ ...TENANT_AAD, column: 'diagnose_ü' });

    expect(encoded.toString('utf8')).toContain('column=diagnose_ü');
    expect(encoded).toStrictEqual(Buffer.from(encoded.toString('utf8'), 'utf8'));
    expect(encoded.includes(Buffer.from([0xc3, 0xbc]))).toBe(true);
  });

  it('given the canonical AAD when encoded then no byte is a carriage return', () => {
    expect(encodeEncryptionAad(TENANT_AAD).includes(0x0d)).toBe(false);
  });
});
