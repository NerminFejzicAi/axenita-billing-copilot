import { Module } from '@nestjs/common';

import { AesGcmEncryptionService } from './aes-gcm-encryption.service.js';
import { ENCRYPTION_KEY_PROVIDER, ENCRYPTION_SERVICE } from './encryption.port.js';
import { ExternalReferenceHmacService } from './external-reference-hmac.service.js';
import { EXTERNAL_REFERENCE_HMAC, HMAC_KEY_PROVIDER } from './external-reference.port.js';
import { HmacLocalKeyProvider } from './hmac-local-key.provider.js';
import { KeySeparationGuard } from './key-separation.guard.js';
import { LocalStaticKeyProvider } from './local-static-key.provider.js';

/**
 * Cross-cutting cryptographic primitives of phase 5 (`04` §7.5 slices P5-I3A and P5-I3B).
 *
 * A DEDICATED MODULE, NOT A CORNER OF A FEATURE MODULE. These primitives are consumed by
 * several future tables across several future modules — `patient_references`, `encounters`,
 * `encounter_documents` and more (D-025 clause 8) — so placing them under any one of them
 * would make the others depend on a business module for a cryptographic boundary. They are
 * equally not `CommonModule` material: that module owns HTTP-shaped cross-cutting concerns,
 * and letting it accumulate crypto would make the boundary harder, not easier, to audit.
 *
 * IMPORTED BY THE ROOT MODULE, WHICH IS WHAT MAKES THE GUARDS REAL. Nest instantiates a
 * module's providers while the application initialises, so every constructor refusal below
 * aborts STARTUP: `LocalStaticKeyProvider`'s four D-025 clause 10 refusals, the two refusals of
 * `HmacLocalKeyProvider`, and the `K_hmac != K_enc` comparison of `KeySeparationGuard`. A
 * misconfigured process cannot come up and then fail at the first encrypted write or the first
 * external reference lookup.
 *
 * `KeySeparationGuard` IS LISTED THOUGH NOTHING INJECTS IT. That is its entire purpose: it is
 * a provider so that the container builds it, and building it is the check. Removing it from
 * this list would silently disable D-070, so it must stay even though no consumer references
 * it.
 *
 * TWO SERVICE BOUNDARIES ARE EXPORTED; NO KEY PROVIDER IS. `ENCRYPTION_KEY_PROVIDER` and
 * `HMAC_KEY_PROVIDER` are module internal, so raw key material is reachable only from the two
 * services and the guard inside this module. A business module can encrypt and can compute an
 * external reference token; it can never read a key.
 *
 * WHAT IT STILL DOES NOT CONTAIN. No consumer exists to "exercise" either service: these slices
 * introduce no repository, no controller and no encrypted or hashed column, and inventing one
 * would be business code they do not own. The deterministic clinical-text primitives, the
 * pseudonym generator and the redaction profile are separate slices and are deliberately
 * absent, as are HMAC rotation orchestration and any persisted HMAC key version.
 */
@Module({
  providers: [
    LocalStaticKeyProvider,
    { provide: ENCRYPTION_KEY_PROVIDER, useExisting: LocalStaticKeyProvider },
    { provide: ENCRYPTION_SERVICE, useClass: AesGcmEncryptionService },
    HmacLocalKeyProvider,
    { provide: HMAC_KEY_PROVIDER, useExisting: HmacLocalKeyProvider },
    { provide: EXTERNAL_REFERENCE_HMAC, useClass: ExternalReferenceHmacService },
    KeySeparationGuard,
  ],
  exports: [ENCRYPTION_SERVICE, EXTERNAL_REFERENCE_HMAC],
})
export class CryptoModule {}
