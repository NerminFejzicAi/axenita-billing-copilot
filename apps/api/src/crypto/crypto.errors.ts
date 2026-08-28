/**
 * Every failure the phase 5 encryption primitives are allowed to produce.
 *
 * TWO CLASSES, ONE RULE. A configuration failure aborts startup; an operation failure aborts a
 * single encrypt or decrypt. Both carry a STATIC message and nothing else.
 *
 * The rule is 09 §9 and §11 combined with D-025: no message below may contain plaintext, a
 * Base64 key, key bytes, ciphertext, an IV, an auth tag, an AAD value or a raw `node:crypto`
 * exception text. `node:crypto` failure messages are not merely uninformative — they are
 * derived from the very material that must not leave the boundary — so they are absorbed and
 * replaced rather than wrapped or chained (`cause` is deliberately never set).
 *
 * The failures are also deliberately COARSE. A decryption refusal says only that decryption
 * failed: distinguishing "wrong key" from "wrong AAD" from "tampered ciphertext" would turn the
 * service into an oracle about the state of stored material.
 *
 * P5-I3A has no HTTP surface, so none of these is mapped to an API error code. A configuration
 * failure surfaces through the existing bootstrap failure path (`bootstrap-failure.ts`), which
 * already logs a static message and allowlisted attributes only.
 */

/**
 * The encryption configuration or the local key provider refused to come up.
 *
 * Thrown from a constructor of a provider the root module builds, so it is a STARTUP failure,
 * never a per-request one (D-025 clause 10).
 */
export class CryptoConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CryptoConfigurationError';
  }
}

/** A single encrypt or decrypt operation was refused. */
export class CryptoOperationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CryptoOperationError';
  }
}

/**
 * `NODE_ENV=production` with the local static key provider wired in (D-025 clause 10).
 *
 * The local provider is a development adapter and nothing else. The production key provider is
 * still an open external dependency (D-OPEN-004a, `13` §3.1).
 */
export function localKeyProviderProhibitedInProduction(): CryptoConfigurationError {
  return new CryptoConfigurationError(
    'The local static encryption key provider must never be used in production (D-025 clause 10). ' +
      'The production key provider is an open external dependency (D-OPEN-004a).',
  );
}

/**
 * The configured key is not RFC 4648 standard Base64 decoding to exactly 32 bytes.
 *
 * Names neither the variable's value nor its decoded length, because a length disclosure is
 * still a disclosure about key material (09 §9, §11).
 */
export function encryptionKeyMaterialRejected(): CryptoConfigurationError {
  return new CryptoConfigurationError(
    'The configured encryption key is not accepted (D-025 clause 10, D-070 RULING 3).',
  );
}

/**
 * The configured key is the known all-zero development fixture (D-025 clause 10).
 *
 * The all-zero key is a PUBLIC PROHIBITED FIXTURE, not a secret: it exists so that a shipped
 * example, a copied test value or a zero-filled buffer cannot silently become a working local
 * key. The message names neither the key nor the digest.
 */
export function prohibitedDevelopmentEncryptionKey(): CryptoConfigurationError {
  return new CryptoConfigurationError(
    'The configured encryption key is a known prohibited development fixture and is refused ' +
      '(D-025 clause 10).',
  );
}

/** `ENCRYPTION_KEY_VERSION` is absent, not an integer, or below 1 (D-025 clauses 10, 14). */
export function invalidEncryptionKeyVersion(): CryptoConfigurationError {
  return new CryptoConfigurationError(
    'The configured encryption key version must be an integer of at least 1 and has no default ' +
      '(D-025 clauses 10 and 14).',
  );
}

/**
 * Decryption was refused — wrong key, wrong AAD, tampered ciphertext or tampered auth tag.
 *
 * ONE ANSWER FOR ALL FOUR CAUSES, on purpose. AES-GCM authenticates the ciphertext and the AAD
 * together, so telling the four apart is not even well defined at the primitive, and reporting
 * a guess would disclose which half of an authenticated envelope a caller got wrong.
 */
export function decryptionFailed(): CryptoOperationError {
  return new CryptoOperationError('Decryption failed.');
}

/** Encryption itself failed. The underlying reason stays inside the boundary. */
export function encryptionFailed(): CryptoOperationError {
  return new CryptoOperationError('Encryption failed.');
}

/** The envelope names an algorithm this service does not implement (D-025 clause 14). */
export function unsupportedEncryptionAlgorithm(): CryptoOperationError {
  return new CryptoOperationError('The envelope names an unsupported encryption algorithm.');
}

/** The envelope names an `encryption_version` this service does not implement (D-025 clause 1). */
export function unsupportedEncryptionVersion(): CryptoOperationError {
  return new CryptoOperationError('The envelope names an unsupported encryption version.');
}

/**
 * The envelope requires a key version the provider cannot serve.
 *
 * The local provider knows exactly one active key version; multi-version key stores and
 * rotation orchestration belong to the deferred production provider (D-OPEN-004a).
 */
export function unsupportedEncryptionKeyVersion(): CryptoOperationError {
  return new CryptoOperationError('The envelope requires an unavailable encryption key version.');
}

/**
 * The envelope's cryptographic material does not have the shape D-025 clause 13 fixes —
 * a 12-byte IV and a 16-byte auth tag.
 */
export function malformedEncryptionEnvelope(): CryptoOperationError {
  return new CryptoOperationError('The envelope is not a well formed AES-256-GCM envelope.');
}
