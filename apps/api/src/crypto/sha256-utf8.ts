import { createHash } from 'node:crypto';

/**
 * The generic SHA-256 helper.
 *
 * It hashes the UTF-8 encoding of the string it is handed, and it does nothing else. No `NFC`,
 * no line-ending normalisation, no trimming, no case change, no validation, no JCS
 * canonicalisation and no keying. Those are the jobs of the primitives that own them.
 *
 * WHY THAT SEPARATION IS THE POINT. A digest helper that quietly normalised its input would
 * make the stored digest depend on a transformation the call site cannot see, and two call
 * sites wanting two different canonical forms could not both be served. So composition is
 * always EXPLICIT and always visible at the call site:
 *
 *     sha256HexUtf8(normaliseClinicalText(raw))
 *
 * UNICODE VALIDATION IS ALSO NOT ITS JOB. This helper hashes whatever UTF-8 Node produces for
 * the string it is given, including the replacement bytes Node substitutes for an unpaired
 * surrogate. Well-formedness is guaranteed UPSTREAM: the canonical clinical caller has already
 * passed through `normaliseClinicalText`, which rejects ill-formed input outright. Adding a
 * hidden repair here would silently hash a value the caller never supplied.
 *
 * It is UNKEYED, which is what makes it the wrong tool for an external identifier: those are
 * low-entropy and must be tokenised with the keyed HMAC primitive, never with a bare digest.
 */

/**
 * The SHA-256 digest of the UTF-8 bytes of `value`.
 *
 * @returns exactly 64 lowercase hexadecimal characters.
 */
export function sha256HexUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
