/**
 * The canonical `ENCRYPTION_SERVICE` boundary (`12` §19, `04` §7.5 slice P5-I3A).
 *
 * WHAT THIS PORT IS FOR
 *
 * D-025 fixes an envelope, not a library call: per field a ciphertext, an IV and an auth tag;
 * per row an algorithm, an envelope version, a key reference and a key version. Every future
 * encrypted column in the system has to produce exactly that shape and has to bind it to the
 * exact location it is stored at through the canonical AAD. Modelling it as ONE injected port
 * is what keeps that from drifting per table: a repository cannot reach a cipher directly, so
 * it cannot invent a second envelope layout, a second AAD or a second key lookup.
 *
 * WHAT THIS PORT DELIBERATELY DOES NOT DO
 *
 * - It does not generate row identifiers. `row_id` is part of the AAD (D-025 clause 5), so the
 *   caller must already know the UUID it is going to INSERT before it encrypts anything. That
 *   is the project rule of `02` §2.2 and D-025 clause 11, and moving generation in here would
 *   quietly make it impossible to honour.
 * - It does not touch a database, and it validates no identifier against one. `practice_id`,
 *   the table name and the column name are inputs, not lookups.
 * - It carries no Prisma type. The cryptographic material is plain `Buffer`; mapping it onto
 *   `bytea` columns belongs to the persistence slice that owns those tables.
 * - It knows nothing about key provenance. Where the key comes from is the key provider's
 *   concern, and the production one is still an open external dependency (D-OPEN-004a).
 */

/** DI token of the canonical encryption boundary (`12` §19). */
export const ENCRYPTION_SERVICE = Symbol('EncryptionService');

/**
 * DI token of the key provider the encryption service reads its key material from.
 *
 * It exists so the cipher never holds a key of its own: the only implementation bound today is
 * `LocalStaticKeyProvider`, and the eventual KMS-backed provider replaces that binding without
 * touching the cipher. It is NOT a KMS abstraction and must not grow into one here.
 */
export const ENCRYPTION_KEY_PROVIDER = Symbol('EncryptionKeyProvider');

/** The only algorithm D-025 v1 accepts (clauses 1, 14). Persisted in `encryption_algorithm`. */
export const ENCRYPTION_ALGORITHM = 'AES-256-GCM';

/** The current envelope generation (D-025 clause 1 — "`envelope_version` počinje od 1"). */
export const ENCRYPTION_VERSION = 1;

/** D-025 clause 2 / clause 13 — the IV is exactly 12 bytes, fresh per field and per write. */
export const ENCRYPTION_IV_BYTE_LENGTH = 12;

/** D-025 clause 2 / clause 13 — the GCM authentication tag is exactly 16 bytes. */
export const ENCRYPTION_AUTH_TAG_BYTE_LENGTH = 16;

/**
 * The literal `practice_id` value of a platform-scope row (D-025 clause 5).
 *
 * Platform-scope material has no tenant, and an empty `practice_id` line would make the AAD of
 * a platform row a prefix-collision risk against a tenant row. The canonical AAD therefore
 * spells the scope out.
 */
export const SYSTEM_SCOPE_PRACTICE_ID = 'SYSTEM';

/**
 * The five values that bind a ciphertext to one exact location (D-025 clause 5).
 *
 * `practiceId` is either a canonical tenant UUID or the literal {@link SYSTEM_SCOPE_PRACTICE_ID}.
 * Neither it nor `rowId` is checked against the database: this is a cryptographic input, and a
 * value that does not exist simply produces an AAD nothing will ever decrypt with.
 *
 * `envelopeVersion` is the AAD's own field name from D-025 clause 5. It is the same NUMBER as
 * the persisted `encryptionVersion` of {@link EncryptionEnvelope} and deliberately NOT the same
 * NAME: the canonical AAD line is `envelope_version=` and the canonical column is
 * `encryption_version`. Renaming either to match the other would change bytes that are
 * authenticated, so the distinction is load bearing and must not be tidied away.
 */
export interface EncryptionAad {
  readonly practiceId: string;
  readonly table: string;
  readonly rowId: string;
  readonly column: string;
  readonly envelopeVersion: number;
}

/**
 * One encrypted field plus the row-level metadata D-025 clause 3 persists alongside it.
 *
 * The three `Buffer` members map to the `<field>_ciphertext`, `<field>_iv` and
 * `<field>_auth_tag` columns of clause 2; the four scalars map to `encryption_algorithm`,
 * `encryption_version`, `encryption_key_ref` and `encryption_key_version` of clause 3, which
 * every encrypted field in one row shares.
 */
export interface EncryptionEnvelope {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly authTag: Buffer;
  /** Always {@link ENCRYPTION_ALGORITHM} in v1 (D-025 clause 14). */
  readonly algorithm: string;
  /** Always {@link ENCRYPTION_VERSION} in v1. */
  readonly encryptionVersion: number;
  /** Non-secret, stable reference to the key that produced this envelope. Never key material. */
  readonly keyRef: string;
  /** Active key generation, `>= 1` (D-025 clause 14). */
  readonly keyVersion: number;
}

/**
 * The canonical encryption boundary.
 *
 * The AAD is a MANDATORY parameter of both operations rather than something the service derives
 * for itself. It cannot be derived: only the caller knows which row and which column it is
 * about to write, and a service that guessed would authenticate the wrong location.
 */
export interface EncryptionService {
  /** Encrypts one field under a fresh IV and the caller's AAD. */
  encrypt(plaintext: Buffer, aad: EncryptionAad): EncryptionEnvelope;

  /** Decrypts one envelope under the caller's AAD, or refuses. Returns the original bytes. */
  decrypt(envelope: EncryptionEnvelope, aad: EncryptionAad): Buffer;
}

/**
 * Source of the symmetric key material the encryption service uses.
 *
 * `keyForVersion` exists because a stored envelope names the generation it was written under,
 * and a provider that cannot serve that generation must refuse rather than decrypt with a
 * different key. It is not a rotation mechanism: rotation orchestration and multi-key stores
 * belong to the deferred production provider (D-OPEN-004a, D-025 clause 7).
 */
export interface EncryptionKeyProvider {
  /** Non-secret, stable, `varchar(255)`-compatible reference. Never contains key material. */
  readonly keyRef: string;

  /** The active key generation, `>= 1`. */
  readonly keyVersion: number;

  /** Key material of the active generation, exactly 32 bytes. */
  currentKey(): Buffer;

  /** Key material of one specific generation, or a refusal if it cannot be served. */
  keyForVersion(keyVersion: number): Buffer;
}
