/**
 * Development authentication token — verification only.
 *
 * THIS IS NOT PRODUCTION AUTHENTICATION AND MUST NEVER BE CALLED ONE.
 *
 * Normative sources: `00` §8.2 and `03` §3.1 fix the transport as `Authorization: Bearer
 * <token>` and fix the verification order — signature, issuer, audience, expiration, subject —
 * as something that must complete BEFORE any database context function is called. `04` §5.2
 * authorises phase 3 to satisfy that contract with "a controlled dev auth guard or a signed dev
 * JWT", `09` §5 requires the development mechanism to be development-only, to fail startup under
 * `NODE_ENV=production` and to carry no default secret, and `13` §1 keeps the production identity
 * provider an open external dependency.
 *
 * This module implements the signed variant, because it is the only one of the two that can
 * satisfy the accepted auth test list of `08` §8 — missing, malformed, expired, wrong issuer and
 * wrong audience must each be distinguishable and each produce `401`.
 *
 * DELIBERATE NON-GOALS (`13` §1, `09` §5, `17` of the phase 3 gate):
 *
 * - no OIDC discovery, no JWKS, no key rotation, no MFA — that is the production provider's job
 *   and remains later work;
 * - no password, no password hash, no local credential store (`04` §5.4: "nema password tabele");
 * - no token ISSUING. The API only verifies. Minting a development token is a test/tooling
 *   concern and is not reachable from the application.
 *
 * WHAT IS IMPLEMENTED: compact JWS, `HS256` only, verified with a constant-time comparison over
 * a shared secret that has no default and is validated by the environment schema.
 *
 * The verified `sub` claim is the ONLY value this module hands onward. It becomes
 * `app.auth_subject` through `app_security.set_auth_subject_context`, which `02` §16.2a and
 * D-047 clause 20 require to originate exclusively from a verified subject and never from a
 * request body, query parameter or untrusted header.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** The exact signing algorithm accepted. Anything else is rejected before any hashing happens. */
const ACCEPTED_ALGORITHM = 'HS256';

/** Number of dot separated segments in a compact JWS. */
const COMPACT_SEGMENTS = 3;

/**
 * Why a token was refused.
 *
 * Kept as a closed union so the guard can map failures onto the frozen error catalogue without
 * string matching. The reason is for the server side only: `03` §3.1 answers every one of these
 * with the same `401`, and the response body never explains which one occurred.
 */
export type DevelopmentTokenFailure =
  | 'MALFORMED'
  | 'UNSUPPORTED_ALGORITHM'
  | 'INVALID_SIGNATURE'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'MISSING_SUBJECT';

/** Raised for every refusal. Carries no token material and no secret. */
export class DevelopmentTokenError extends Error {
  public readonly failure: DevelopmentTokenFailure;

  public constructor(failure: DevelopmentTokenFailure) {
    // The message names the failure class only. It never contains the token, a claim value or
    // the secret, because it may be surfaced in a log line (09 §11).
    super(`Development token rejected: ${failure}.`);
    this.name = 'DevelopmentTokenError';
    this.failure = failure;
  }
}

/** The verification policy. Every field comes from validated configuration. */
export interface DevelopmentTokenPolicy {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  /** Milliseconds since the epoch. Injected so expiry behaviour is testable without waiting. */
  readonly now: number;
}

interface TokenClaims {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly exp?: unknown;
  readonly nbf?: unknown;
  readonly sub?: unknown;
}

function decodeSegment(segment: string): unknown {
  let decoded: string;

  try {
    decoded = Buffer.from(segment, 'base64url').toString('utf8');
  } catch {
    throw new DevelopmentTokenError('MALFORMED');
  }

  try {
    return JSON.parse(decoded);
  } catch {
    throw new DevelopmentTokenError('MALFORMED');
  }
}

function asRecord(value: unknown, failure: DevelopmentTokenFailure): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DevelopmentTokenError(failure);
  }

  return value as Record<string, unknown>;
}

/**
 * Constant-time signature comparison.
 *
 * `timingSafeEqual` throws on a length mismatch, so the lengths are compared first — a mismatch
 * is not secret information, the byte values are.
 */
function signatureMatches(expected: Buffer, actual: Buffer): boolean {
  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function audienceMatches(claim: unknown, expected: string): boolean {
  if (typeof claim === 'string') {
    return claim === expected;
  }

  if (Array.isArray(claim)) {
    return claim.some((entry) => typeof entry === 'string' && entry === expected);
  }

  return false;
}

/** Reads a numeric date claim, in seconds since the epoch. */
function numericDate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Verifies a development token and returns its verified subject.
 *
 * The order is exactly the order `03` §3.1 prescribes: signature, issuer, audience, expiration,
 * subject. Nothing is read from the payload for authorisation purposes — the payload carries no
 * roles, no permissions, no practice and no user id, and `24.10` of `08` requires that a caller
 * supplied role claim can never influence anything. The only claim that leaves this function is
 * `sub`.
 *
 * @throws DevelopmentTokenError for every refusal.
 */
export function verifyDevelopmentToken(token: string, policy: DevelopmentTokenPolicy): string {
  const segments = token.split('.');

  if (segments.length !== COMPACT_SEGMENTS) {
    throw new DevelopmentTokenError('MALFORMED');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;

  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    encodedHeader.length === 0 ||
    encodedPayload.length === 0 ||
    encodedSignature.length === 0
  ) {
    throw new DevelopmentTokenError('MALFORMED');
  }

  const header = asRecord(decodeSegment(encodedHeader), 'MALFORMED');

  // Algorithm confusion defence: the accepted algorithm is a constant, never a value read from
  // the token. `none` and every asymmetric algorithm are rejected here, before any comparison.
  if (header['alg'] !== ACCEPTED_ALGORITHM) {
    throw new DevelopmentTokenError('UNSUPPORTED_ALGORITHM');
  }

  // 1. Signature.
  const expected = createHmac('sha256', policy.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  if (!signatureMatches(expected, Buffer.from(encodedSignature, 'base64url'))) {
    throw new DevelopmentTokenError('INVALID_SIGNATURE');
  }

  const claims = asRecord(decodeSegment(encodedPayload), 'MALFORMED') as TokenClaims;

  // 2. Issuer.
  if (typeof claims.iss !== 'string' || claims.iss !== policy.issuer) {
    throw new DevelopmentTokenError('INVALID_ISSUER');
  }

  // 3. Audience.
  if (!audienceMatches(claims.aud, policy.audience)) {
    throw new DevelopmentTokenError('INVALID_AUDIENCE');
  }

  // 4. Expiration. A token without `exp` is refused: an eternal development credential is
  // exactly the shape 09 §5 forbids.
  const nowInSeconds = Math.floor(policy.now / 1000);
  const expiresAt = numericDate(claims.exp);

  if (expiresAt === undefined || expiresAt <= nowInSeconds) {
    throw new DevelopmentTokenError('EXPIRED');
  }

  const notBefore = numericDate(claims.nbf);

  if (notBefore !== undefined && notBefore > nowInSeconds) {
    throw new DevelopmentTokenError('NOT_YET_VALID');
  }

  // 5. Subject.
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new DevelopmentTokenError('MISSING_SUBJECT');
  }

  return claims.sub;
}
