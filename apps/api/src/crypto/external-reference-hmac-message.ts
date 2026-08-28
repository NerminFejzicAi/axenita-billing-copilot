import {
  systemScopeNotSupportedForExternalReference,
  unsupportedExternalReferenceDomain,
  unsupportedExternalReferenceSourceSystem,
} from './crypto.errors.js';
import {
  EXTERNAL_REFERENCE_HMAC_DOMAINS,
  EXTERNAL_REFERENCE_SOURCE_SYSTEMS,
  type ExternalReferenceIdentity,
} from './external-reference.port.js';

/**
 * The canonical external-reference HMAC message.
 *
 * WHY THE EXACT BYTES MATTER
 *
 * These bytes are the message a keyed digest is taken over, so they ARE the token. A reordered
 * line, a `\r\n`, a trailing newline, a stray space or a "harmless" extra field would change
 * every token the system has ever produced, and a lookup by external reference would stop
 * finding rows that are perfectly intact. The layout is therefore part of the stored format,
 * exactly like the AAD of D-025 clause 5.
 *
 * The message is deliberately literal and deliberately dumb:
 *
 *   v1
 *   domain=<one of the three closed domains>
 *   practice_id=<canonical tenant UUID>
 *   source_system=<one of the five closed literals>
 *   value=<already normalised external identifier>
 *
 * - exactly these five lines, in exactly this order;
 * - LF separators only, never CR, and NO trailing newline;
 * - UTF-8 at the crypto boundary;
 * - no JSON and no JCS — this is not a canonicalised document, and RFC 8785 has no part in it;
 * - NO normalisation of any input. `value` arrives already normalised by a profile the caller
 *   chose explicitly. Normalising again here would mean the profile is applied twice for one
 *   caller and once for another, which is the drift the port exists to prevent.
 *
 * WHY THERE ARE RUNTIME CHECKS FOR THINGS THE TYPES ALREADY FORBID. `domain` and `sourceSystem`
 * are closed literal unions, so well typed code cannot get them wrong. The checks below are
 * defence in depth for the callers TypeScript cannot see: values crossing a JSON boundary, a
 * cast, or a future consumer compiled against a different version of this file. A token built
 * from an unknown domain would be indistinguishable from a valid one and would live in the
 * database forever.
 */
export function buildExternalReferenceHmacMessage(identity: ExternalReferenceIdentity): string {
  assertSupportedIdentity(identity);

  return [
    'v1',
    `domain=${identity.domain}`,
    `practice_id=${identity.practiceId}`,
    `source_system=${identity.sourceSystem}`,
    `value=${identity.value}`,
  ].join('\n');
}

/**
 * The UTF-8 bytes of {@link buildExternalReferenceHmacMessage} — what the MAC consumes.
 *
 * Step 9 of MANUAL-v1: the normalised identifier becomes UTF-8 HERE and nowhere earlier. The
 * encoding is named explicitly rather than left to a default, because it is part of the stored
 * format and a changed encoding would be indistinguishable from a changed key.
 */
export function encodeExternalReferenceHmacMessage(identity: ExternalReferenceIdentity): Buffer {
  return Buffer.from(buildExternalReferenceHmacMessage(identity), 'utf8');
}

/**
 * The platform-scope `practice_id` literal of D-025 clause 5.
 *
 * Repeated here as a REJECTED value rather than imported as an accepted one. An external
 * reference belongs to a practice's own identifier space and platform scope has no such space,
 * so `SYSTEM` is outside this contract: `ExternalReferenceIdentity.practiceId` does not
 * advertise it, and a caller that bypasses the type is refused instead of silently producing a
 * platform-scope token nothing should ever hold.
 */
const UNSUPPORTED_PLATFORM_SCOPE_PRACTICE_ID = 'SYSTEM';

function assertSupportedIdentity(identity: ExternalReferenceIdentity): void {
  if (!(EXTERNAL_REFERENCE_HMAC_DOMAINS as readonly string[]).includes(identity.domain)) {
    throw unsupportedExternalReferenceDomain();
  }

  if (!(EXTERNAL_REFERENCE_SOURCE_SYSTEMS as readonly string[]).includes(identity.sourceSystem)) {
    throw unsupportedExternalReferenceSourceSystem();
  }

  if (identity.practiceId === UNSUPPORTED_PLATFORM_SCOPE_PRACTICE_ID) {
    throw systemScopeNotSupportedForExternalReference();
  }
}
