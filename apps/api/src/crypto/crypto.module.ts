import { Module } from '@nestjs/common';

import { AesGcmEncryptionService } from './aes-gcm-encryption.service.js';
import { ENCRYPTION_KEY_PROVIDER, ENCRYPTION_SERVICE } from './encryption.port.js';
import { LocalStaticKeyProvider } from './local-static-key.provider.js';

/**
 * Cross-cutting cryptographic primitives of phase 5 (`04` §7.5 slice P5-I3A).
 *
 * A DEDICATED MODULE, NOT A CORNER OF A FEATURE MODULE. These primitives are consumed by
 * several future tables across several future modules — `patient_references`, `encounters`,
 * `encounter_documents` and more (D-025 clause 8) — so placing them under any one of them
 * would make the others depend on a business module for a cryptographic boundary. They are
 * equally not `CommonModule` material: that module owns HTTP-shaped cross-cutting concerns,
 * and letting it accumulate crypto would make the boundary harder, not easier, to audit.
 *
 * IMPORTED BY THE ROOT MODULE, WHICH IS WHAT MAKES THE GUARDS REAL. Nest instantiates a
 * module's providers while the application initialises, so `LocalStaticKeyProvider`'s four
 * D-025 clause 10 refusals — production, key shape, prohibited fixture, key version — abort
 * STARTUP. A misconfigured process cannot come up and then fail at the first encrypted write.
 *
 * WHAT IT DOES NOT CONTAIN. No consumer exists to "exercise" the service: P5-I3A introduces no
 * repository, no controller and no encrypted column, and inventing one would be business code
 * this slice does not own. The HMAC service, the external-reference identity primitives and
 * the deterministic text primitives are separate slices and are deliberately absent.
 */
@Module({
  providers: [
    LocalStaticKeyProvider,
    { provide: ENCRYPTION_KEY_PROVIDER, useExisting: LocalStaticKeyProvider },
    { provide: ENCRYPTION_SERVICE, useClass: AesGcmEncryptionService },
  ],
  exports: [ENCRYPTION_SERVICE],
})
export class CryptoModule {}
