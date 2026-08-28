import { describe, expect, it } from 'vitest';

import { AesGcmEncryptionService } from './aes-gcm-encryption.service.js';
import { CryptoOperationError } from './crypto.errors.js';
import {
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_AUTH_TAG_BYTE_LENGTH,
  ENCRYPTION_IV_BYTE_LENGTH,
  ENCRYPTION_VERSION,
  type EncryptionAad,
  type EncryptionEnvelope,
  type EncryptionKeyProvider,
} from './encryption.port.js';

/**
 * Deterministic, clearly labelled NON-SECRET test key material.
 *
 * Neither value is the prohibited all-zero fixture, neither is a production secret, and neither
 * appears in `.env.example` (D-025 clauses 9 and 10, 08 §12).
 */
const TEST_KEY = Buffer.from('axenita-local-test-enc-key-32b!!', 'utf8');
const OTHER_TEST_KEY = Buffer.from('axenita-other-test-enc-key-32b!!', 'utf8');

const KEY_REF = 'test-static-key-v1';

function keyProvider(key: Buffer, keyVersion = 1): EncryptionKeyProvider {
  return {
    keyRef: KEY_REF,
    keyVersion,
    currentKey: (): Buffer => key,
    keyForVersion: (requested: number): Buffer => {
      if (requested !== keyVersion) {
        throw new CryptoOperationError('The envelope requires an unavailable key version.');
      }
      return key;
    },
  };
}

const AAD: EncryptionAad = {
  practiceId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  table: 'patient_references',
  rowId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  column: 'display_name_ciphertext',
  envelopeVersion: 1,
};

const PLAINTEXT = Buffer.from('Muster, Anna — 1985-04-17', 'utf8');

function serviceFor(key: Buffer = TEST_KEY): AesGcmEncryptionService {
  return new AesGcmEncryptionService(keyProvider(key));
}

describe('AesGcmEncryptionService', () => {
  it('given a plaintext and an AAD when encrypted and decrypted then the original bytes return', () => {
    const service = serviceFor();

    const envelope = service.encrypt(PLAINTEXT, AAD);

    expect(service.decrypt(envelope, AAD)).toStrictEqual(PLAINTEXT);
  });

  it('given a plaintext when encrypted then the ciphertext is not the plaintext (08 §12)', () => {
    const envelope = serviceFor().encrypt(PLAINTEXT, AAD);

    expect(envelope.ciphertext).not.toStrictEqual(PLAINTEXT);
    expect(envelope.ciphertext.toString('utf8')).not.toContain('Muster');
  });

  it('given an encryption when performed then the IV is 12 bytes and the tag is 16 (D-025 §2)', () => {
    const envelope = serviceFor().encrypt(PLAINTEXT, AAD);

    expect(envelope.iv).toHaveLength(ENCRYPTION_IV_BYTE_LENGTH);
    expect(envelope.authTag).toHaveLength(ENCRYPTION_AUTH_TAG_BYTE_LENGTH);
  });

  it('given the same plaintext and AAD twice when encrypted then the IVs differ (D-025 §6)', () => {
    // IV reuse under one GCM key is catastrophic, so a fresh IV per write is asserted rather
    // than assumed. There is no parameter through which a caller could supply one.
    const service = serviceFor();

    const first = service.encrypt(PLAINTEXT, AAD);
    const second = service.encrypt(PLAINTEXT, AAD);

    expect(first.iv).not.toStrictEqual(second.iv);
  });

  it('given distinct IVs when the same input is encrypted twice then the ciphertexts differ', () => {
    const service = serviceFor();

    const first = service.encrypt(PLAINTEXT, AAD);
    const second = service.encrypt(PLAINTEXT, AAD);

    expect(first.ciphertext).not.toStrictEqual(second.ciphertext);
    expect(service.decrypt(first, AAD)).toStrictEqual(service.decrypt(second, AAD));
  });

  it('given an encryption when performed then the persisted metadata is canonical (D-025 §3, §14)', () => {
    const envelope = serviceFor().encrypt(PLAINTEXT, AAD);

    expect(envelope.algorithm).toBe(ENCRYPTION_ALGORITHM);
    expect(envelope.algorithm).toBe('AES-256-GCM');
    expect(envelope.encryptionVersion).toBe(ENCRYPTION_VERSION);
    expect(envelope.encryptionVersion).toBe(1);
    expect(envelope.keyRef).toBe(KEY_REF);
    expect(envelope.keyVersion).toBeGreaterThanOrEqual(1);
  });

  it('given the metadata of an envelope when inspected then it carries no key material', () => {
    const envelope = serviceFor().encrypt(PLAINTEXT, AAD);

    expect(envelope.keyRef).not.toContain(TEST_KEY.toString('base64'));
    expect(envelope.keyRef).not.toContain(TEST_KEY.toString('utf8'));
    expect(envelope.keyRef.length).toBeLessThanOrEqual(255);
  });

  it.each([
    ['practice', { practiceId: '00000000-0000-4000-8000-000000000001' }],
    ['row', { rowId: '00000000-0000-4000-8000-000000000002' }],
    ['table', { table: 'encounters' }],
    ['column', { column: 'date_of_birth_ciphertext' }],
    ['envelope version', { envelopeVersion: 2 }],
  ])('given a wrong %s in the AAD when decrypted then it fails', (_label, override) => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);

    expect(() => service.decrypt(envelope, { ...AAD, ...override })).toThrow(CryptoOperationError);
  });

  it('given a wrong key when decrypted then it fails', () => {
    const envelope = serviceFor(TEST_KEY).encrypt(PLAINTEXT, AAD);

    expect(() => serviceFor(OTHER_TEST_KEY).decrypt(envelope, AAD)).toThrow(CryptoOperationError);
  });

  it('given a tampered ciphertext when decrypted then it fails', () => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);
    const tampered = Buffer.from(envelope.ciphertext);
    tampered.writeUInt8(tampered.readUInt8(0) ^ 0xff, 0);

    expect(() => service.decrypt({ ...envelope, ciphertext: tampered }, AAD)).toThrow(
      CryptoOperationError,
    );
  });

  it('given a tampered auth tag when decrypted then it fails', () => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);
    const tampered = Buffer.from(envelope.authTag);
    tampered.writeUInt8(tampered.readUInt8(0) ^ 0xff, 0);

    expect(() => service.decrypt({ ...envelope, authTag: tampered }, AAD)).toThrow(
      CryptoOperationError,
    );
  });

  it('given a wrong key version when decrypted then it fails', () => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);

    expect(() => service.decrypt({ ...envelope, keyVersion: 2 }, AAD)).toThrow(
      CryptoOperationError,
    );
  });

  it('given an unsupported algorithm when decrypted then it fails', () => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);

    expect(() => service.decrypt({ ...envelope, algorithm: 'AES-128-CBC' }, AAD)).toThrow(
      CryptoOperationError,
    );
  });

  it('given an unsupported encryption version when decrypted then it fails', () => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);

    expect(() => service.decrypt({ ...envelope, encryptionVersion: 2 }, AAD)).toThrow(
      CryptoOperationError,
    );
  });

  it.each([
    [
      'an 11 byte IV',
      (envelope: EncryptionEnvelope): EncryptionEnvelope => ({
        ...envelope,
        iv: envelope.iv.subarray(0, 11),
      }),
    ],
    [
      'a 15 byte auth tag',
      (envelope: EncryptionEnvelope): EncryptionEnvelope => ({
        ...envelope,
        authTag: envelope.authTag.subarray(0, 15),
      }),
    ],
  ])('given %s when decrypted then the envelope is refused (D-025 §13)', (_label, mutate) => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);

    expect(() => service.decrypt(mutate(envelope), AAD)).toThrow(CryptoOperationError);
  });

  it('given a ciphertext moved to another row when decrypted then it fails (D-025 rationale)', () => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);

    const otherRow: EncryptionAad = { ...AAD, rowId: '5c4b3a29-1817-4655-9443-32211100ffee' };

    expect(() => service.decrypt(envelope, otherRow)).toThrow(CryptoOperationError);
  });

  it('given any failure when raised then no cryptographic input is exposed', () => {
    const service = serviceFor();
    const envelope = service.encrypt(PLAINTEXT, AAD);

    let thrown: unknown;
    try {
      service.decrypt(envelope, { ...AAD, rowId: '00000000-0000-4000-8000-000000000009' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CryptoOperationError);
    const rendered = `${(thrown as Error).name}: ${(thrown as Error).message}`;

    expect(rendered).not.toContain(PLAINTEXT.toString('utf8'));
    expect(rendered).not.toContain(TEST_KEY.toString('utf8'));
    expect(rendered).not.toContain(TEST_KEY.toString('base64'));
    expect(rendered).not.toContain(envelope.ciphertext.toString('base64'));
    expect(rendered).not.toContain(envelope.iv.toString('base64'));
    expect(rendered).not.toContain(envelope.authTag.toString('base64'));
    expect(rendered).not.toContain(AAD.rowId);
    // The raw `node:crypto` text of a failed tag check never crosses the boundary.
    expect(rendered).not.toContain('unable to authenticate');
    expect((thrown as Error).cause).toBeUndefined();
  });

  it('given an empty plaintext when encrypted then it round-trips and is still authenticated', () => {
    const service = serviceFor();
    const envelope = service.encrypt(Buffer.alloc(0), AAD);

    expect(service.decrypt(envelope, AAD)).toStrictEqual(Buffer.alloc(0));
    expect(envelope.authTag).toHaveLength(ENCRYPTION_AUTH_TAG_BYTE_LENGTH);
  });
});
