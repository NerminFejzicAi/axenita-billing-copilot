import { type EncryptionAad } from './encryption.port.js';

/**
 * The canonical D-025 clause 5 additional authenticated data.
 *
 * WHY THE EXACT BYTES MATTER
 *
 * AAD is authenticated, not encrypted: GCM verifies that the exact byte sequence supplied at
 * decryption equals the one supplied at encryption, and refuses otherwise. That is precisely
 * what binds a ciphertext to one row and one column — a ciphertext moved into another row, or
 * into another column of the same row, no longer decrypts, which is a control RLS cannot
 * provide (D-025 "Razlog"). It also means every byte of this string is part of the stored
 * format: a reordered line, a `\r\n`, a trailing newline, a stray space or a "harmless" extra
 * field would silently make every already-stored ciphertext undecryptable.
 *
 * So the builder is deliberately literal and deliberately dumb:
 *
 *   v1
 *   practice_id=<canonical UUID or SYSTEM>
 *   table=<table name>
 *   row_id=<canonical UUID>
 *   column=<column name>
 *   envelope_version=<integer>
 *
 * - exactly these six lines, in exactly this order;
 * - LF separators only, never CR, and NO trailing newline;
 * - UTF-8 at the crypto boundary;
 * - no JSON and no JCS — this is not a canonicalised document, and RFC 8785 has no part in it;
 * - no normalisation, trimming or case folding of any input: the caller's values go in as they
 *   are, because "helpful" normalisation would let two different locations produce one AAD.
 */
export function buildEncryptionAad(aad: EncryptionAad): string {
  return [
    'v1',
    `practice_id=${aad.practiceId}`,
    `table=${aad.table}`,
    `row_id=${aad.rowId}`,
    `column=${aad.column}`,
    `envelope_version=${aad.envelopeVersion}`,
  ].join('\n');
}

/**
 * The UTF-8 bytes of {@link buildEncryptionAad} — the form the cipher actually consumes.
 *
 * The encoding is named explicitly rather than left to a default, because this value is part of
 * the persisted format and a changed encoding would be indistinguishable from a changed key.
 */
export function encodeEncryptionAad(aad: EncryptionAad): Buffer {
  return Buffer.from(buildEncryptionAad(aad), 'utf8');
}
