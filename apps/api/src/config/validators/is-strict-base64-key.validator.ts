import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Decoded length every phase 5 local key variable must have.
 *
 * D-025 clause 1 fixes the AES-256-GCM key at exactly 32 bytes, and D-070 `RULING 3` §3.2
 * repeats it for the configuration surface: "dekodirana vrijednost mora biti tačno 32 bajta".
 */
export const ENCRYPTION_KEY_BYTE_LENGTH = 32;

/**
 * The ONLY standard-Base64 shape that can encode exactly 32 bytes (RFC 4648 §4).
 *
 * 32 bytes are 43 significant characters plus one canonical padding character. The alphabet is
 * deliberately the standard one: `-` and `_` — the URL-safe alphabet of RFC 4648 §5 — are not
 * accepted, and neither is whitespace anywhere in the value.
 */
const STRICT_BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Decodes a strictly canonical 32-byte Base64 key, or returns `undefined`.
 *
 * `Buffer.from(value, 'base64')` alone is NOT sufficient and must never be trusted on its own:
 * it silently ignores whitespace, accepts the URL-safe alphabet, accepts missing padding and
 * accepts a final quantum whose unused trailing bits are non-zero. Every one of those inputs
 * would decode to "32 bytes" while denoting a value the operator did not write, which for key
 * material means a silently different key.
 *
 * Three checks are therefore applied together, and all three are load bearing:
 *
 *  1. the exact standard-Base64 shape above — rejects whitespace, the URL-safe alphabet and
 *     absent or malformed padding;
 *  2. the decoded length — rejects 31-byte and 33-byte values that pass a laxer shape check;
 *  3. a canonical round trip — rejects a non-canonical final quantum, which is the one defect
 *     the shape and the length cannot see, because such a value re-encodes to a different
 *     string than the one that was supplied.
 *
 * The rejected value is never returned, logged or embedded in an error (09 §9, §11).
 */
export function decodeStrictBase64Key(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || !STRICT_BASE64_32_BYTES.test(value)) {
    return undefined;
  }

  const decoded = Buffer.from(value, 'base64');

  if (decoded.length !== ENCRYPTION_KEY_BYTE_LENGTH) {
    return undefined;
  }

  if (decoded.toString('base64') !== value) {
    return undefined;
  }

  return decoded;
}

/**
 * Validates that a configured value is RFC 4648 standard Base64 decoding to exactly 32 bytes.
 *
 * The failure message names the property and the rule only. It never echoes the value, because
 * the value is key material (09 §9, §11, D-070 `RULING 3`).
 */
@ValidatorConstraint({ name: 'isStrictBase64Key', async: false })
class IsStrictBase64KeyConstraint implements ValidatorConstraintInterface {
  public validate(value: unknown): boolean {
    return decodeStrictBase64Key(value) !== undefined;
  }

  public defaultMessage(args: ValidationArguments): string {
    return (
      `${args.property} must be RFC 4648 standard Base64 without whitespace that decodes to ` +
      `exactly ${ENCRYPTION_KEY_BYTE_LENGTH} bytes, and has no default`
    );
  }
}

export function IsStrictBase64Key(validationOptions?: ValidationOptions): PropertyDecorator {
  return function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsStrictBase64KeyConstraint,
    });
  };
}
