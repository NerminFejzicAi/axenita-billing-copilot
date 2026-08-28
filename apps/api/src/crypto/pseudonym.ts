import { randomBytes } from 'node:crypto';

/**
 * The patient pseudonym primitive.
 *
 * A pseudonym is the HUMAN-FACING handle for a patient — the string a practitioner reads aloud,
 * types into a search box and writes on a worklist. It carries no personal data and is derived
 * from nothing: it is drawn from the CSPRNG and from nothing else.
 *
 * WHY DERIVATION IS FORBIDDEN. A pseudonym computed from an identifier — by hash, by keyed
 * digest, by UUID slice, by timestamp or by a database sequence — leaks. A digest of a
 * low-entropy identifier is brute-forceable, a timestamp discloses when a patient was
 * registered and a sequence discloses how many patients a practice has. Random bytes disclose
 * nothing.
 *
 * WHAT THIS FILE DOES NOT DO. It does not check the database, does not detect a collision, does
 * not retry, does not promise uniqueness and does not validate an incoming pseudonym's syntax.
 * A generated candidate is exactly that — a candidate. Persisting it, and resolving the unique
 * violation a second identical candidate would cause, belongs to the slice that owns the table.
 */

/** The fixed prefix of every pseudonym. */
export const PSEUDONYM_PREFIX = 'P-';

/** The number of body symbols after {@link PSEUDONYM_PREFIX}. */
export const PSEUDONYM_BODY_LENGTH = 10;

/**
 * The Crockford Base32 alphabet — exactly 32 symbols.
 *
 * `I`, `L`, `O` and `U` are absent by construction: the first three are visually confusable
 * with `1`, `1` and `0` when a pseudonym is read aloud or copied off a screen, and `U` is
 * omitted so that a random draw cannot spell an offensive word. This is a GENERATION alphabet
 * only — P5-I3C deliberately ships no decoder and therefore no ambiguous-character aliasing.
 */
export const PSEUDONYM_BODY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The total character length of a pseudonym — `P-` plus ten body symbols. */
export const PSEUDONYM_LENGTH = PSEUDONYM_PREFIX.length + PSEUDONYM_BODY_LENGTH;

/**
 * The randomness seam.
 *
 * A plain function parameter rather than an injected provider: randomness is the only thing
 * about this primitive a test needs to control, and a Nest token would buy nothing but a
 * lifecycle. The default is ALWAYS the Node CSPRNG, and there is no production branch that
 * selects anything else.
 */
export type RandomBytes = (size: number) => Buffer;

/**
 * Draws one pseudonym candidate.
 *
 * The mapping is UNBIASED without rejection sampling: one byte yields one symbol through
 * `byte & 0x1f`, and 32 divides 256 exactly, so each of the 32 symbols is produced by exactly
 * eight of the 256 byte values. Rejection sampling would add a branch that buys no uniformity.
 *
 * @param randomBytesFn the randomness source; the Node CSPRNG unless a test substitutes one.
 * @returns a candidate pseudonym. Uniqueness is NOT claimed and NOT checked.
 */
export function generatePseudonym(randomBytesFn: RandomBytes = randomBytes): string {
  const bytes = randomBytesFn(PSEUDONYM_BODY_LENGTH);

  let body = '';
  for (let index = 0; index < PSEUDONYM_BODY_LENGTH; index += 1) {
    body += PSEUDONYM_BODY_ALPHABET.charAt(bytes.readUInt8(index) & 0x1f);
  }

  return `${PSEUDONYM_PREFIX}${body}`;
}

/**
 * Maps `a`-`z` to `A`-`Z` and leaves every other character alone (OD-P5-I3C-2).
 *
 * ASCII ONLY, ON PURPOSE. `toUpperCase()` is a Unicode operation: it turns `ı` into `I` and the
 * `ﬁ` ligature into `FI`, and a locale-aware uppercasing turns `i` into `İ` under a Turkish
 * locale. Any of those would map a string a pseudonym can never contain onto one it can, so a
 * lookup canonicalised that way could collide with a real pseudonym. This mapping is total,
 * locale-independent and reversible outside `a`-`z`.
 *
 * It does not trim, does not normalise Unicode and does NOT VALIDATE. It exists so that the
 * future query boundary can compare a user's casing-insensitive input against stored uppercase
 * values; syntax validation belongs to whichever slice accepts that input.
 */
export function canonicalisePseudonymUppercase(value: string): string {
  let canonical = '';

  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    canonical +=
      unit >= 0x61 && unit <= 0x7a ? String.fromCharCode(unit - 0x20) : value.charAt(index);
  }

  return canonical;
}
