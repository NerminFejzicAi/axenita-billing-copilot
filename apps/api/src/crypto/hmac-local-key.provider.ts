import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service.js';
import { decodeStrictBase64Key } from '../config/validators/is-strict-base64-key.validator.js';
import {
  hmacKeyMaterialRejected,
  localHmacKeyProviderProhibitedInProduction,
} from './crypto.errors.js';
import { type HmacKeyProvider } from './external-reference.port.js';

/**
 * The local development provider of `K_hmac`.
 *
 * NOT PRODUCTION READY, AND NOT A STEP TOWARDS IT — the same standing as
 * `LocalStaticKeyProvider`, and for the same reason. It holds one static key read from the
 * process environment. It performs no KMS call, integrates with no secrets manager, keeps no
 * multi-key store, orchestrates no rotation and re-derives no token. The production key
 * provider remains an open external dependency (D-OPEN-004a, `13` §3.1).
 *
 * BOTH GUARDS LIVE IN THE CONSTRUCTOR, and that placement is the point. `CryptoModule` is
 * imported by the root module, so this provider is built while the application is coming up:
 * each refusal below is a STARTUP failure and never a surprise at the first lookup. The key
 * shape guard is already enforced by the environment schema; it is repeated here because this
 * class is the thing that must not hold a bad key, and a future caller that builds it outside
 * `validateEnvironment` gets the same refusal.
 *
 * THE KEY BYTES ARE PRIVATE AND STAY PRIVATE. `CryptoModule` binds this class behind the
 * module-internal `HMAC_KEY_PROVIDER` token and does not export it, so the only two things that
 * can read the material are the HMAC service and the key-separation guard. Nothing here logs,
 * persists, or renders a key byte in an error.
 */
@Injectable()
export class HmacLocalKeyProvider implements HmacKeyProvider {
  private readonly key: Buffer;

  public constructor(appConfig: AppConfigService) {
    // Guard A — a production process must not come up with a development key provider wired
    // in. Named first so no configured key is even read in production.
    if (appConfig.isProduction) {
      throw localHmacKeyProviderProhibitedInProduction();
    }

    // Guard B — strictly canonical RFC 4648 standard Base64 decoding to exactly 32 bytes,
    // through the SAME validator the encryption key uses (D-070 `RULING 3` §3.2). A second
    // Base64 implementation would be a second set of accepted spellings.
    const decoded = decodeStrictBase64Key(appConfig.hmacLocalKey);
    if (decoded === undefined) {
      throw hmacKeyMaterialRejected();
    }

    this.key = decoded;
  }

  /** Key material of the active HMAC key. Never logged and never rendered in an error. */
  public currentKey(): Buffer {
    return this.key;
  }
}
