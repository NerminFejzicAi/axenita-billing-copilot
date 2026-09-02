/**
 * The ADDITIVE v1 pseudonym syntax validator of the service-level lookup (`CO-P5-I3-I4-1`).
 *
 * Normative sources: `03` §11 (the canonical `P-` + 10 Crockford Base32 form); `04` §7.5a.3,
 * *Vlasništvo lookup sposobnosti* ("kanonski `P5-I3` ASCII uppercase helper **bez mutacije**,
 * plus **zaseban aditivan v1 validator** sintakse"); D-072 `OD-P5-I4-14`; D-079 `RULING B`
 * items 9 and 11; `08` §12.12 obligation 12.
 *
 * WHY IT LIVES HERE AND NOT IN THE `P5-I3C` GENERATOR
 *
 * `04` §7.5a.3 asks for the uppercase canonicaliser to be reused WITHOUT MUTATION and for the
 * syntax validator to be a SEPARATE, ADDITIVE artefact. `pseudonym.ts` is therefore imported and
 * not edited: its alphabet, its prefix and its body length are the single source of the shape,
 * and this file adds the predicate the generator deliberately does not have (it draws candidates
 * and claims no uniqueness and no validation).
 *
 * WHAT "CANONICAL" MEANS HERE, MECHANICALLY
 *
 *     P-  followed by EXACTLY 10 characters from 0123456789ABCDEFGHJKMNPQRSTVWXYZ
 *
 * Crockford Base32 excludes `I`, `L`, `O` and `U`, so a lookup for `P-K7M2QX4TB9` cannot be
 * confused with one for a visually similar string containing `O` or `I` — those simply are not
 * pseudonyms and are refused before any statement runs.
 *
 * CASE IS CANONICALISED, NOT MATCHED LOOSELY. The caller's input passes through the accepted
 * ASCII uppercase canonicaliser first, and the STORED comparison is plain equality — no
 * `LOWER()`, no `citext`, no special collation (`04` §7.5a.3). That is why validation happens on
 * the CANONICALISED value: `p-k7m2qx4tb9` is the same pseudonym, while `ﬁ`-style Unicode
 * uppercasing is impossible because the canonicaliser is ASCII-only by construction.
 */

import {
  PSEUDONYM_BODY_ALPHABET,
  PSEUDONYM_BODY_LENGTH,
  PSEUDONYM_PREFIX,
} from '../../crypto/pseudonym.js';

/**
 * The set of accepted body characters, built ONCE from the canonical alphabet.
 *
 * Derived from `PSEUDONYM_BODY_ALPHABET` rather than restated, so the validator and the generator
 * cannot disagree about which symbols exist: a change to the alphabet would move both together or
 * neither.
 */
const BODY_ALPHABET: ReadonlySet<string> = new Set(PSEUDONYM_BODY_ALPHABET);

/**
 * Whether `canonical` is a syntactically valid v1 pseudonym.
 *
 * @param canonical a value that has ALREADY passed through `canonicalisePseudonymUppercase`.
 *   Passing a raw client value would make the predicate reject correct lowercase input, which is
 *   why the one caller canonicalises first and this parameter is named for that fact.
 *
 * The check is written out rather than expressed as a regular expression on purpose: the alphabet
 * is a canonical CONSTANT, and a hand-written character class in a pattern would be a second
 * spelling of it that could drift. It also refuses by LENGTH first, so a very long input costs
 * one comparison rather than a scan.
 */
export function isCanonicalPseudonym(canonical: string): boolean {
  if (canonical.length !== PSEUDONYM_PREFIX.length + PSEUDONYM_BODY_LENGTH) {
    return false;
  }

  if (!canonical.startsWith(PSEUDONYM_PREFIX)) {
    return false;
  }

  for (let index = PSEUDONYM_PREFIX.length; index < canonical.length; index += 1) {
    if (!BODY_ALPHABET.has(canonical.charAt(index))) {
      return false;
    }
  }

  return true;
}
