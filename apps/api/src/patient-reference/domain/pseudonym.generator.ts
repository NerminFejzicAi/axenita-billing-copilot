/**
 * The CSPRNG seam of pseudonym generation — a provider so that a spec can make it deterministic.
 *
 * Normative sources: `03` §11 (the canonical `P-` + 10 Crockford Base32 form, CSPRNG-drawn and
 * "ni na koji način izveden iz eksternog identifikatora"); `04` §7.5a.3
 * (`PSEUDONYM_INSERT_MAX_ATTEMPTS = 5`, no deterministic fallback); `CO-P5-I3-I4-1` ("**CSPRNG**
 * kroz mockabilan seam, bez determinističke grane u produkciji"); `08` §12.12 obligations 7-8.
 *
 * WHY THIS CLASS EXISTS AT ALL
 *
 * `generatePseudonym` already takes a randomness function, but its default argument is not a
 * seam a Nest-constructed service can substitute, and the two proofs `08` §12.12 requires —
 * five consecutive collisions, and a collision on the first four attempts with success on the
 * fifth — cannot be driven without controlling which candidates are drawn. A provider is the
 * smallest thing that makes that possible without touching the accepted `P5-I3C` generator: the
 * generator is imported and NOT modified, and this class adds only a lifecycle around it.
 *
 * THERE IS NO DETERMINISTIC BRANCH IN PRODUCTION, and this file is where that is visible: the
 * implementation is one line, it calls `generatePseudonym()` with its own default randomness
 * source, and it takes no seed, no counter and no configuration flag. A test substitutes the
 * WHOLE provider; it does not switch a mode inside it.
 */

import { Injectable } from '@nestjs/common';

import { generatePseudonym } from '../../crypto/pseudonym.js';

@Injectable()
export class PseudonymGenerator {
  /**
   * Draws ONE fresh candidate pseudonym.
   *
   * Uniqueness is NOT claimed and NOT checked here — that is the targeted `ON CONFLICT` insert's
   * job, and asking the database is the only way to know without an existence pre-read, which
   * `03` §11 forbids.
   */
  public next(): string {
    return generatePseudonym();
  }
}
