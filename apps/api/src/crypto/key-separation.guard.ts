import { timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ENCRYPTION_KEY_BYTE_LENGTH } from '../config/validators/is-strict-base64-key.validator.js';
import { keySeparationMaterialUnusable, keySeparationViolated } from './crypto.errors.js';
import { ENCRYPTION_KEY_PROVIDER, type EncryptionKeyProvider } from './encryption.port.js';
import { HMAC_KEY_PROVIDER, type HmacKeyProvider } from './external-reference.port.js';

/**
 * The `K_hmac != K_enc` startup guard (D-070).
 *
 * WHY IT EXISTS. Reusing one key for confidentiality and for a deterministic lookup digest
 * destroys the separation the two mechanisms are supposed to provide: the digest is computed
 * over attacker-influenceable messages, so a shared key hands an attacker a chosen-message
 * oracle against the key that also protects every ciphertext. Nothing in the environment
 * schema can catch it — both variables are individually valid — so it has to be a comparison,
 * and a comparison that runs before the process serves anything.
 *
 * IT IS A PROVIDER, NOT A `CanActivate`. The Nest name collision is unfortunate but the
 * placement is deliberate: `CryptoModule` is imported by the root module, so Nest builds this
 * class while the application initialises. A process configured with one key in both variables
 * cannot come up at all, which is strictly stronger than refusing at the first request.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT. It proves the two configured keys are not the SAME
 * BYTES. It does NOT prove they were generated independently, that neither is derived from the
 * other, or that they are cryptographically independent in any stronger sense. Those remain
 * operational obligations of whoever provisions the keys, and no startup check can discharge
 * them.
 *
 * THE COMPARISON IS ON DECODED BYTES, IN CONSTANT TIME. Comparing the configured strings would
 * be the wrong subject — the guard is about key material, not about configuration spelling —
 * and `timingSafeEqual` is used because a comparison that returns early leaks how many leading
 * bytes two secrets share.
 *
 * IT RETAINS NOTHING. Both buffers are constructor locals, referenced nowhere afterwards, and
 * no instance field holds key material. The refusal is static, and neither key is logged.
 */
@Injectable()
export class KeySeparationGuard {
  public constructor(
    @Inject(ENCRYPTION_KEY_PROVIDER) encryptionKeys: EncryptionKeyProvider,
    @Inject(HMAC_KEY_PROVIDER) hmacKeys: HmacKeyProvider,
  ) {
    const encryptionKey = encryptionKeys.currentKey();
    const hmacKey = hmacKeys.currentKey();

    // `timingSafeEqual` throws on a length mismatch, and both providers already enforce 32
    // bytes. Checking first turns a would-be `RangeError` carrying crypto material into a
    // static configuration refusal.
    if (
      encryptionKey.length !== ENCRYPTION_KEY_BYTE_LENGTH ||
      hmacKey.length !== ENCRYPTION_KEY_BYTE_LENGTH
    ) {
      throw keySeparationMaterialUnusable();
    }

    if (timingSafeEqual(encryptionKey, hmacKey)) {
      throw keySeparationViolated();
    }
  }
}
