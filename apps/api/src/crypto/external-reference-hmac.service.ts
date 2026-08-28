import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { externalReferenceHmacFailed } from './crypto.errors.js';
import { encodeExternalReferenceHmacMessage } from './external-reference-hmac-message.js';
import {
  EXTERNAL_REFERENCE_HMAC_GENERATION_PREFIX,
  HMAC_KEY_PROVIDER,
  type ExternalReferenceHmac,
  type ExternalReferenceIdentity,
  type HmacKeyProvider,
} from './external-reference.port.js';

/**
 * HMAC-SHA256 over the canonical five-line message — the current generation of external
 * reference tokens (`04` §7.5 slice P5-I3B).
 *
 * WHY A KEYED DIGEST AND NOT A PLAIN HASH. An external identifier is drawn from a small,
 * guessable space: patient numbers are short, often sequential, and an unkeyed SHA-256 of one
 * is trivially reversed by enumeration. The key is what makes the token opaque to anybody who
 * holds the database but not `K_hmac`, which is exactly the attacker the control is for. The
 * key must therefore be a DIFFERENT key from `K_enc` — a property `KeySeparationGuard` refuses
 * startup over rather than trusting an operator to remember.
 *
 * WHAT THIS SERVICE DOES NOT DO. It does not normalise: `identity.value` arrives already
 * canonical, from a profile the caller selected explicitly. It reads no database, so it can
 * neither confirm nor deny that a token matches a stored row. It has no key generation, parses
 * no other generation prefix, and orchestrates no rotation: multi-generation compatibility is
 * future scope and a speculative parser for it would be an untested guess.
 */
@Injectable()
export class ExternalReferenceHmacService implements ExternalReferenceHmac {
  public constructor(@Inject(HMAC_KEY_PROVIDER) private readonly keyProvider: HmacKeyProvider) {}

  /**
   * Computes `h1.` followed by the 64 lowercase hex characters of
   * `HMAC-SHA256(K_hmac, canonical message)`.
   *
   * The message is built BEFORE the try block on purpose: a rejected domain, a rejected source
   * system or a platform-scope practice id is a caller error with its own precise static
   * message, and folding it into the generic failure below would hide it.
   */
  public compute(identity: ExternalReferenceIdentity): string {
    const message = encodeExternalReferenceHmacMessage(identity);

    try {
      const digest = createHmac('sha256', this.keyProvider.currentKey())
        .update(message)
        .digest('hex');

      return `${EXTERNAL_REFERENCE_HMAC_GENERATION_PREFIX}${digest}`;
    } catch {
      // A `node:crypto` failure message is derived from the very material that must not leave
      // this boundary, so it is absorbed and replaced rather than wrapped or chained
      // (09 §9, §11) — the same rule `AesGcmEncryptionService` follows.
      throw externalReferenceHmacFailed();
    }
  }
}
