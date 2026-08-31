import { jsonCanonicalisationRejected } from './crypto.errors.js';
import { isWellFormedUnicode } from './manual-v1-identifier-normalizer.js';

/**
 * A parsed JSON value — the only thing this module knows how to canonicalise.
 *
 * It is the shape `JSON.parse` produces and nothing wider. `undefined`, functions, symbols,
 * `BigInt`, `Date` and every other host object are deliberately OUTSIDE the type, and the
 * canonicaliser refuses them at runtime as well (see {@link canonicaliseJson}).
 */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A parsed JSON object. */
export type JsonObject = { [key: string]: JsonValue };

/**
 * RFC 8785 (JSON Canonicalization Scheme) — a LOCAL, FULL implementation.
 *
 * WHY THIS EXISTS AT ALL. Two persistent, retroactively unfixable digests are built on top of
 * it: `idempotency_keys.request_sha256` and `audit_events.event_sha256` (D-069 `RULING 4` and
 * `RULING 5`; D-072 `OD-P5-I4-3`, `OD-P5-I4-4`, `OD-P5-I4-5`). A digest is only as stable as
 * the byte string underneath it, so the byte string has to be pinned by a specification rather
 * than by whatever a serialiser happens to emit today.
 *
 * IT IS THE FULL SCHEME, NOT A PROJECT SUBSET. D-072 `OD-P5-I4-5` forbids presenting a reduced
 * in-house subset under the name JCS, and no JCS package is authorised
 * (`NEW_RUNTIME_DEPENDENCY_REQUIRED = NO`, D-077 `RULING C`), so the scheme is implemented here
 * from the RFC and pinned by the RFC's own published vectors.
 *
 * IT IS NOT `JSON.stringify` WITH SORTED KEYS. Three of the rules below are things
 * `JSON.stringify` does not do: it silently DROPS a key whose value is `undefined`, it silently
 * ESCAPES a lone surrogate into `\udXXX` instead of refusing it, and it invokes `toJSON` on
 * whatever object it is handed. Each of those would let hash material differ from the value the
 * caller actually supplied, which is the one failure this primitive exists to prevent. So every
 * rule is written out explicitly and every unsupported input is REFUSED rather than repaired.
 *
 * THE RULES, AS RFC 8785 STATES THEM
 *
 *  - §3.1    the data to serialise MUST conform to I-JSON (RFC 7493) — hence finite numbers
 *            only, and well formed Unicode only;
 *  - §3.2.2.2 invalid Unicode such as a lone surrogate (e.g. `U+DEAD`) MUST cause a conforming
 *            implementation to TERMINATE WITH AN ERROR — never to escape it and carry on;
 *  - §3.2.3  object property names are sorted as arrays of UTF-16 CODE UNITS;
 *  - §3.2.3  arrays MUST be scanned for objects, whose properties are then sorted too, but the
 *            ORDER OF ARRAY ELEMENTS MUST NOT CHANGE;
 *  - §3.2.2.3 numbers use the ECMAScript number-to-string algorithm;
 *  - §3.2.4  the result is encoded as UTF-8, which is what the digest then consumes.
 *
 * NO UNICODE NORMALISATION HAPPENS HERE. Not `NFC`, not `NFKC`, not case folding. Two strings
 * that differ by composition are two different strings and MUST produce two different digests;
 * normalising would silently merge them. Where the project wants `NFC` it applies it upstream,
 * explicitly, in the primitive that owns that rule.
 *
 * NO WHITESPACE IS EMITTED — no spaces, no newlines, no indentation.
 */

/**
 * The canonical RFC 8785 JSON text of `value`.
 *
 * The returned string is UTF-16 in memory, as every JavaScript string is; §3.2.4's UTF-8
 * boundary is crossed by the digest helper that consumes it (`sha256HexUtf8`), which encodes
 * as UTF-8. Composition is explicit and visible at the call site — this module never hashes.
 *
 * @throws CryptoOperationError if the value is not I-JSON: a lone surrogate, a non finite
 * number, or a value with no JSON counterpart at all.
 */
export function canonicaliseJson(value: JsonValue): string {
  return serialiseValue(value);
}

function serialiseValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return serialiseNumber(value);
    case 'string':
      return serialiseString(value);
    case 'object':
      return Array.isArray(value)
        ? serialiseArray(value)
        : serialiseObject(value as Record<string, unknown>);
    default:
      // `undefined`, `function`, `symbol` and `bigint`. `JSON.stringify` would drop or throw
      // inconsistently depending on position; there is no canonical JSON form, so it is refused.
      throw jsonCanonicalisationRejected('UNSUPPORTED_VALUE');
  }
}

/**
 * A number, per RFC 8785 §3.2.2.3 — the ECMAScript number-to-string algorithm.
 *
 * `String(value)` IS that algorithm, so the RFC's Appendix B samples (`5e-324`, `1e+30`,
 * `295147905179352830000`, `9.999999999999997e+22`) fall out of it directly rather than being
 * re-derived here.
 *
 * MINUS ZERO IS WRITTEN `0`. Appendix B pins it, and it matters: `-0` and `0` are the same JSON
 * number, so they must not produce two digests. `String(-0)` already yields `"0"`; the branch
 * below states the rule rather than relying on that being remembered.
 *
 * `NaN` and the infinities have NO JSON representation and are not I-JSON (§3.1), so they are
 * refused instead of being coerced to `null` the way `JSON.stringify` would.
 */
function serialiseNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw jsonCanonicalisationRejected('NON_FINITE_NUMBER');
  }

  return value === 0 ? '0' : String(value);
}

/**
 * A string, per RFC 8785 §3.2.2.2.
 *
 * ILL FORMED UNICODE IS REFUSED, NOT ESCAPED. This is the conformance point D-077 `RULING C`
 * corrects explicitly: a lone surrogate MUST terminate the operation with a deterministic
 * error. `JSON.stringify` has been able to represent one as a `\udXXX` escape since ES2019,
 * and accepting it on that basis would hash a value no conforming implementation elsewhere
 * could reproduce. The surrogate predicate is the canonical MANUAL-v1 one, reused unchanged
 * rather than duplicated.
 *
 * ONLY THE SEVEN SHORT ESCAPES AND THE C0 CONTROLS ARE ESCAPED. `/` is NOT escaped, `U+007F`
 * is NOT escaped, and no character above `U+001F` is turned into a `\u` sequence — every one
 * of them is emitted literally and reaches the UTF-8 boundary as itself.
 */
function serialiseString(value: string): string {
  if (!isWellFormedUnicode(value)) {
    throw jsonCanonicalisationRejected('ILL_FORMED_UNICODE');
  }

  let out = '"';

  // Iterated by CODE UNIT, which is safe precisely because the value is already known to be
  // well formed: every surrogate is half of a pair and is copied through with its partner.
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    switch (unit) {
      case 0x22:
        out += '\\"';
        break;
      case 0x5c:
        out += '\\\\';
        break;
      case 0x08:
        out += '\\b';
        break;
      case 0x09:
        out += '\\t';
        break;
      case 0x0a:
        out += '\\n';
        break;
      case 0x0c:
        out += '\\f';
        break;
      case 0x0d:
        out += '\\r';
        break;
      default:
        out +=
          unit < 0x20
            ? // Lowercase hex, four digits — the form the RFC's own §3.2.3 sample emits
              // where `U+000F` canonicalises to the six characters backslash-u-0-0-0-f.
              `\\u${unit.toString(16).padStart(4, '0')}`
            : value.charAt(index);
    }
  }

  return `${out}"`;
}

/**
 * An array, per RFC 8785 §3.2.3.
 *
 * ELEMENT ORDER IS NEVER TOUCHED — an array is ordered data, and reordering it would change
 * the caller's meaning. Only the OBJECTS INSIDE it are canonicalised, recursively, which is
 * exactly the scan the RFC mandates.
 *
 * A HOLE IN A SPARSE ARRAY IS REFUSED. `JSON.stringify` renders one as `null`, inventing an
 * element the caller never wrote; recursion through `serialiseValue` reaches `undefined`
 * instead and throws.
 */
function serialiseArray(value: readonly unknown[]): string {
  let out = '[';

  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) {
      out += ',';
    }

    out += serialiseValue(value[index]);
  }

  return `${out}]`;
}

/**
 * An object, per RFC 8785 §3.2.3 — properties sorted by UTF-16 code unit, then recursed into.
 *
 * ONLY A PLAIN OBJECT IS ACCEPTED. A `Date`, a `Map`, a class instance or anything else with a
 * prototype of its own is refused rather than serialised: `JSON.stringify` would call its
 * `toJSON` and hash a representation the caller never constructed. A parsed JSON value never
 * contains one, so refusing costs nothing and closes the door.
 *
 * A SYMBOL KEYED PROPERTY IS ALSO REFUSED, for the same reason in the other direction —
 * `Object.keys` cannot see it, so it would silently vanish from the hash material.
 */
function serialiseObject(value: Record<string, unknown>): string {
  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw jsonCanonicalisationRejected('UNSUPPORTED_VALUE');
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw jsonCanonicalisationRejected('UNSUPPORTED_VALUE');
  }

  const keys = Object.keys(value).sort(compareUtf16CodeUnits);

  let out = '{';

  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) {
      out += ',';
    }

    const key = keys[index] as string;

    out += `${serialiseString(key)}:${serialiseValue(value[key])}`;
  }

  return `${out}}`;
}

/**
 * Orders two property names by raw UTF-16 code unit, per RFC 8785 §3.2.3.
 *
 * WRITTEN OUT RATHER THAN DELEGATED. `localeCompare` is the trap here: it is locale sensitive,
 * so the same two keys could sort differently on two machines and produce two digests for one
 * document. `Array.prototype.sort`'s default comparator and the `<` operator do happen to
 * compare code units, but neither says so at the call site. This one does, and it is the
 * property the RFC actually specifies.
 *
 * Comparing code units — NOT code points — is deliberate: it is what makes a supplementary
 * character sort by its surrogate values, which is the behaviour the RFC pins.
 */
function compareUtf16CodeUnits(left: string, right: string): number {
  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);

    if (difference !== 0) {
      return difference;
    }
  }

  // One name is a prefix of the other: the shorter sorts first.
  return left.length - right.length;
}
