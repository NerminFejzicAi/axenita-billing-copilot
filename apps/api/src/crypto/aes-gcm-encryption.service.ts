import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  decryptionFailed,
  encryptionFailed,
  malformedEncryptionEnvelope,
  unsupportedEncryptionAlgorithm,
  unsupportedEncryptionVersion,
} from './crypto.errors.js';
import { encodeEncryptionAad } from './encryption-aad.js';
import {
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_AUTH_TAG_BYTE_LENGTH,
  ENCRYPTION_IV_BYTE_LENGTH,
  ENCRYPTION_KEY_PROVIDER,
  ENCRYPTION_VERSION,
  type EncryptionAad,
  type EncryptionEnvelope,
  type EncryptionKeyProvider,
  type EncryptionService,
} from './encryption.port.js';

/** The `node:crypto` spelling of the algorithm D-025 clause 1 fixes. */
const NODE_CIPHER = 'aes-256-gcm';

/**
 * The v1 AES-256-GCM implementation of the canonical encryption boundary (D-025 clauses 1–6).
 *
 * Built on `node:crypto` alone — no new runtime dependency is introduced for a primitive the
 * platform already ships.
 *
 * A FRESH IV PER OPERATION, WITHOUT AN OPT OUT. `encrypt` draws 12 cryptographically secure
 * random bytes every single call and the caller cannot supply one (D-025 clause 6). This is not
 * a stylistic choice: reusing an IV under one key in GCM is catastrophic — it leaks the XOR of
 * the two plaintexts and, worse, exposes the authentication subkey, which breaks forgery
 * resistance for every message under that key. Because there is no parameter for it, no future
 * caller can "reuse the IV of the previous version" during an UPDATE.
 *
 * NOTHING FROM `node:crypto` CROSSES THIS BOUNDARY. Every failure is converted into a static
 * error from `crypto.errors.ts`. The library's own messages are derived from the material being
 * processed, so they are absorbed here rather than wrapped, chained or logged (09 §11).
 *
 * NOTHING IS LOGGED AT ALL. This class has no logger on purpose: there is no line it could
 * write about an operation that would not be about a key, a plaintext or a ciphertext.
 */
@Injectable()
export class AesGcmEncryptionService implements EncryptionService {
  public constructor(
    @Inject(ENCRYPTION_KEY_PROVIDER) private readonly keyProvider: EncryptionKeyProvider,
  ) {}

  public encrypt(plaintext: Buffer, aad: EncryptionAad): EncryptionEnvelope {
    const key = this.keyProvider.currentKey();

    try {
      const iv = randomBytes(ENCRYPTION_IV_BYTE_LENGTH);
      const cipher = createCipheriv(NODE_CIPHER, key, iv, {
        authTagLength: ENCRYPTION_AUTH_TAG_BYTE_LENGTH,
      });
      cipher.setAAD(encodeEncryptionAad(aad));

      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

      return {
        ciphertext,
        iv,
        authTag: cipher.getAuthTag(),
        algorithm: ENCRYPTION_ALGORITHM,
        encryptionVersion: ENCRYPTION_VERSION,
        keyRef: this.keyProvider.keyRef,
        keyVersion: this.keyProvider.keyVersion,
      };
    } catch {
      throw encryptionFailed();
    }
  }

  public decrypt(envelope: EncryptionEnvelope, aad: EncryptionAad): Buffer {
    // The envelope declares what it is; a declaration this implementation cannot honour is
    // refused before a key is fetched, so an unsupported envelope never reaches a cipher.
    if (envelope.algorithm !== ENCRYPTION_ALGORITHM) {
      throw unsupportedEncryptionAlgorithm();
    }

    if (envelope.encryptionVersion !== ENCRYPTION_VERSION) {
      throw unsupportedEncryptionVersion();
    }

    if (
      envelope.iv.length !== ENCRYPTION_IV_BYTE_LENGTH ||
      envelope.authTag.length !== ENCRYPTION_AUTH_TAG_BYTE_LENGTH
    ) {
      throw malformedEncryptionEnvelope();
    }

    // Outside the try below on purpose: an unavailable key generation is a distinct, static
    // refusal and must not be collapsed into "decryption failed" (D-025 clause 7).
    const key = this.keyProvider.keyForVersion(envelope.keyVersion);

    try {
      const decipher = createDecipheriv(NODE_CIPHER, key, envelope.iv, {
        authTagLength: ENCRYPTION_AUTH_TAG_BYTE_LENGTH,
      });
      decipher.setAAD(encodeEncryptionAad(aad));
      decipher.setAuthTag(envelope.authTag);

      // `final()` is what verifies the tag. Skipping it — or returning `update()` alone —
      // would return UNAUTHENTICATED plaintext, which is the classic way to lose every
      // guarantee GCM provides.
      return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
    } catch {
      // Wrong key, wrong AAD, tampered ciphertext and tampered tag are one answer (09 §11).
      throw decryptionFailed();
    }
  }
}
