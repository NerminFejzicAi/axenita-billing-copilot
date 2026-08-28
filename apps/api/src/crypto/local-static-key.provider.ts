import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service.js';
import { decodeStrictBase64Key } from '../config/validators/is-strict-base64-key.validator.js';
import {
  encryptionKeyMaterialRejected,
  invalidEncryptionKeyVersion,
  localKeyProviderProhibitedInProduction,
  prohibitedDevelopmentEncryptionKey,
  unsupportedEncryptionKeyVersion,
} from './crypto.errors.js';
import { type EncryptionKeyProvider } from './encryption.port.js';

/**
 * Stable, non-secret reference persisted in `encryption_key_ref` for locally encrypted rows.
 *
 * It names the PROVIDER and its generation, never the key. It is short enough for the
 * `varchar(255)` column D-025 clause 3 fixes, and it is stable, because a row keeps the value
 * that was written with it: changing this literal would orphan every row already stored under
 * the old one.
 *
 * It also announces what it is. A row carrying this reference was encrypted by a development
 * adapter and can be recognised as such by an operator reading the table.
 */
export const LOCAL_STATIC_ENCRYPTION_KEY_REF = 'local-static-development-v1';

/**
 * SHA-256 of the 32 all-zero bytes — the prohibited development fixture of D-025 clause 10.
 *
 * The all-zero key is a PUBLIC, PROHIBITED FIXTURE, not a secret: it is the value a
 * zero-filled buffer, a copied placeholder or a shipped example most plausibly decodes to, and
 * it must never become a working local key. Pinning the DIGEST rather than the key keeps the
 * fixture itself out of this file, and the comparison is made against the DECODED bytes, so no
 * alternative Base64 spelling of the same key can slip past.
 *
 * Neither the digest nor anything derived from the configured key is ever logged.
 */
export const PROHIBITED_DEVELOPMENT_ENCRYPTION_KEY_DIGEST =
  '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';

/**
 * The local development key provider of D-025 clause 9.
 *
 * NOT PRODUCTION READY, AND NOT A STEP TOWARDS IT. It holds one static key read from the
 * process environment. It performs no KMS call, integrates with no secrets manager, keeps no
 * multi-key store, orchestrates no rotation and re-encrypts no row. The production key
 * provider — the KMS choice, the access model, the rotation cadence and the recovery procedure
 * — remains an open external dependency (D-OPEN-004a, `13` §3.1), and nothing here anticipates
 * which shape it will take.
 *
 * ALL FOUR STARTUP GUARDS OF D-025 CLAUSE 10 LIVE IN THE CONSTRUCTOR, and that placement is the
 * point. `CryptoModule` is imported by the root module, so this provider is built while the
 * application is coming up: every refusal below is a STARTUP failure, exactly like
 * `DevelopmentAuthGuard`'s production refusal, and never a surprise at the first encrypted
 * write. Two of them — the key shape and the key version — are already enforced by the
 * environment schema; they are repeated here because this class is the thing that must not
 * hold a bad key, and a future caller that builds it outside `validateEnvironment` gets the
 * same refusal.
 */
@Injectable()
export class LocalStaticKeyProvider implements EncryptionKeyProvider {
  public readonly keyRef: string = LOCAL_STATIC_ENCRYPTION_KEY_REF;

  public readonly keyVersion: number;

  private readonly key: Buffer;

  public constructor(appConfig: AppConfigService) {
    // Guard A — a production process must not come up with a development key provider wired
    // in (D-025 clause 10). Named first so no configured key is even read in production.
    if (appConfig.isProduction) {
      throw localKeyProviderProhibitedInProduction();
    }

    // Guard B — strictly canonical Base64 decoding to exactly 32 bytes (D-025 clause 1,
    // D-070 RULING 3 §3.2).
    const decoded = decodeStrictBase64Key(appConfig.encryptionLocalKey);
    if (decoded === undefined) {
      throw encryptionKeyMaterialRejected();
    }

    // Guard C — the known all-zero development fixture, compared on the DECODED bytes.
    if (
      createHash('sha256').update(decoded).digest('hex') ===
      PROHIBITED_DEVELOPMENT_ENCRYPTION_KEY_DIGEST
    ) {
      throw prohibitedDevelopmentEncryptionKey();
    }

    // Guard D — an active key version is mandatory and has no default (D-025 clauses 10, 14).
    const keyVersion = appConfig.encryptionKeyVersion;
    if (!Number.isInteger(keyVersion) || keyVersion < 1) {
      throw invalidEncryptionKeyVersion();
    }

    this.key = decoded;
    this.keyVersion = keyVersion;
  }

  /** Key material of the active generation. Never logged and never rendered in an error. */
  public currentKey(): Buffer {
    return this.key;
  }

  /**
   * Key material of one specific generation.
   *
   * This provider knows exactly ONE active generation, so an envelope written under any other
   * key version is refused rather than decrypted with the current key. Serving several
   * generations is a property of the deferred production provider, not of a static local one
   * (D-025 clause 7, D-OPEN-004a).
   */
  public keyForVersion(keyVersion: number): Buffer {
    if (keyVersion !== this.keyVersion) {
      throw unsupportedEncryptionKeyVersion();
    }

    return this.key;
  }
}
