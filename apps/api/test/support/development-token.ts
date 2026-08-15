import { createHmac } from 'node:crypto';

/**
 * Test-only issuer of development authentication tokens.
 *
 * The application deliberately contains NO token minting code: it verifies and nothing else
 * (`09` §5, `13` §1). Signing therefore lives here, in the test harness, so that a signing
 * routine can never be reached from a request path or shipped in `dist`.
 *
 * Nothing in this file is a credential: the secret below is an obvious fixture, exactly like the
 * database placeholders of `.env.example` (`12` §14, `09` §9).
 */

/** The fixture policy every suite signs against. */
export const DEVELOPMENT_AUTH_FIXTURE = {
  secret: 'test_only_development_auth_secret_value_32+',
  issuer: 'axenita-development',
  audience: 'axenita-api',
} as const;

export interface DevelopmentTokenOptions {
  /** Overrides the `iss` claim, to exercise issuer rejection. */
  readonly issuer?: string;
  /** Overrides the `aud` claim, to exercise audience rejection. */
  readonly audience?: string | readonly string[];
  /** Overrides the signing secret, to exercise signature rejection. */
  readonly secret?: string;
  /** Seconds from now until `exp`. A negative value produces an already expired token. */
  readonly expiresInSeconds?: number;
  /** Omits `exp` entirely. */
  readonly withoutExpiry?: boolean;
  /** Omits `sub` entirely. */
  readonly withoutSubject?: boolean;
  /** Overrides the `alg` header, to exercise algorithm confusion rejection. */
  readonly algorithm?: string;
  /** Extra claims. Used to prove that unrecognised claims cannot influence anything. */
  readonly extraClaims?: Readonly<Record<string, unknown>>;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Signs a compact HS256 development token for `subject`. */
export function signDevelopmentToken(
  subject: string,
  options: DevelopmentTokenOptions = {},
): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);

  const header = { alg: options.algorithm ?? 'HS256', typ: 'JWT' };

  const claims: Record<string, unknown> = {
    iss: options.issuer ?? DEVELOPMENT_AUTH_FIXTURE.issuer,
    aud: options.audience ?? DEVELOPMENT_AUTH_FIXTURE.audience,
    iat: nowInSeconds,
    ...options.extraClaims,
  };

  if (options.withoutExpiry !== true) {
    claims['exp'] = nowInSeconds + (options.expiresInSeconds ?? 300);
  }

  if (options.withoutSubject !== true) {
    claims['sub'] = subject;
  }

  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signature = createHmac('sha256', options.secret ?? DEVELOPMENT_AUTH_FIXTURE.secret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

/** Convenience wrapper producing a complete `Authorization` header value. */
export function developmentBearer(subject: string, options: DevelopmentTokenOptions = {}): string {
  return `Bearer ${signDevelopmentToken(subject, options)}`;
}
