/**
 * Verification contract of the isolated development token (`03` §3.1, `08` §8, `09` §5).
 *
 * `08` §8 lists the accepted auth cases — missing, malformed, expired, wrong issuer, wrong
 * audience, and a valid token whose subject is unprovisioned. The last one is an ADMISSION
 * failure and belongs to the bootstrap service, not here: this module's job ends the moment a
 * subject is verified.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DevelopmentTokenError,
  verifyDevelopmentToken,
  type DevelopmentTokenPolicy,
} from './development-token.js';

const POLICY: DevelopmentTokenPolicy = {
  secret: 'test_only_development_auth_secret_value_32+',
  issuer: 'axenita-development',
  audience: 'axenita-api',
  now: Date.UTC(2026, 7, 15, 12, 0, 0),
};

const NOW_IN_SECONDS = Math.floor(POLICY.now / 1000);

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sign(
  claims: Readonly<Record<string, unknown>>,
  overrides: { header?: Readonly<Record<string, unknown>>; secret?: string } = {},
): string {
  const header = overrides.header ?? { alg: 'HS256', typ: 'JWT' };
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signature = createHmac('sha256', overrides.secret ?? POLICY.secret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

function validClaims(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    iss: POLICY.issuer,
    aud: POLICY.audience,
    sub: 'dev|practice-admin',
    iat: NOW_IN_SECONDS - 10,
    exp: NOW_IN_SECONDS + 300,
    ...overrides,
  };
}

function failureOf(token: string): string {
  try {
    verifyDevelopmentToken(token, POLICY);
  } catch (error) {
    expect(error).toBeInstanceOf(DevelopmentTokenError);
    return (error as DevelopmentTokenError).failure;
  }

  throw new Error('The token was accepted, but the spec expected a refusal.');
}

describe('verifyDevelopmentToken', () => {
  it('returns the verified subject of a well formed token', () => {
    expect(verifyDevelopmentToken(sign(validClaims()), POLICY)).toBe('dev|practice-admin');
  });

  it.each([
    ['an empty string', ''],
    ['a bare word', 'not-a-token'],
    ['two segments', 'aaa.bbb'],
    ['four segments', 'aaa.bbb.ccc.ddd'],
    ['an empty segment', 'aaa..ccc'],
  ])('refuses %s as malformed', (_label, token) => {
    expect(failureOf(token)).toBe('MALFORMED');
  });

  it('refuses a payload that is not JSON', () => {
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = Buffer.from('not json', 'utf8').toString('base64url');
    const signature = createHmac('sha256', POLICY.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    expect(failureOf(`${header}.${payload}.${signature}`)).toBe('MALFORMED');
  });

  it.each(['none', 'HS512', 'RS256'])(
    'refuses the %s algorithm before comparing anything',
    (alg) => {
      expect(failureOf(sign(validClaims(), { header: { alg, typ: 'JWT' } }))).toBe(
        'UNSUPPORTED_ALGORITHM',
      );
    },
  );

  it('refuses a token signed with another secret', () => {
    expect(
      failureOf(sign(validClaims(), { secret: 'another_secret_value_that_is_32_chars_x' })),
    ).toBe('INVALID_SIGNATURE');
  });

  it('refuses a tampered payload — the signature covers header and payload', () => {
    const token = sign(validClaims());
    const [header, , signature] = token.split('.');
    const forged = encode(validClaims({ sub: 'dev|somebody-else' }));

    expect(failureOf(`${String(header)}.${forged}.${String(signature)}`)).toBe('INVALID_SIGNATURE');
  });

  it('refuses a wrong issuer', () => {
    expect(failureOf(sign(validClaims({ iss: 'https://evil.example' })))).toBe('INVALID_ISSUER');
    expect(failureOf(sign(validClaims({ iss: undefined })))).toBe('INVALID_ISSUER');
  });

  it('refuses a wrong audience and accepts an audience array that contains the expected value', () => {
    expect(failureOf(sign(validClaims({ aud: 'another-api' })))).toBe('INVALID_AUDIENCE');
    expect(failureOf(sign(validClaims({ aud: ['another-api'] })))).toBe('INVALID_AUDIENCE');
    expect(
      verifyDevelopmentToken(sign(validClaims({ aud: ['another-api', POLICY.audience] })), POLICY),
    ).toBe('dev|practice-admin');
  });

  it('refuses an expired token and a token without any expiry', () => {
    expect(failureOf(sign(validClaims({ exp: NOW_IN_SECONDS - 1 })))).toBe('EXPIRED');
    expect(failureOf(sign(validClaims({ exp: NOW_IN_SECONDS })))).toBe('EXPIRED');
    expect(failureOf(sign(validClaims({ exp: undefined })))).toBe('EXPIRED');
    expect(failureOf(sign(validClaims({ exp: 'soon' })))).toBe('EXPIRED');
  });

  it('refuses a token that is not valid yet', () => {
    expect(failureOf(sign(validClaims({ nbf: NOW_IN_SECONDS + 60 })))).toBe('NOT_YET_VALID');
  });

  it('refuses a token without a usable subject', () => {
    expect(failureOf(sign(validClaims({ sub: undefined })))).toBe('MISSING_SUBJECT');
    expect(failureOf(sign(validClaims({ sub: '' })))).toBe('MISSING_SUBJECT');
    expect(failureOf(sign(validClaims({ sub: 42 })))).toBe('MISSING_SUBJECT');
  });

  it('verifies in the order 03 §3.1 prescribes — signature before every claim check', () => {
    // Every claim is wrong AND the signature is wrong: the reported failure must be the
    // signature, which proves nothing from an unverified payload was trusted first.
    const token = sign(validClaims({ iss: 'wrong', aud: 'wrong', exp: NOW_IN_SECONDS - 1 }), {
      secret: 'another_secret_value_that_is_32_chars_x',
    });

    expect(failureOf(token)).toBe('INVALID_SIGNATURE');
  });

  it('returns nothing but the subject — no claim can carry a role, permission or user id', () => {
    const token = sign(
      validClaims({
        roles: ['PRACTICE_ADMIN'],
        permissions: ['tariff.manage'],
        user_id: '22222222-2222-4222-8222-222222222001',
        practice_id: '11111111-1111-4111-8111-111111111001',
      }),
    );

    // The function's return type is the subject string. There is no channel for anything else,
    // which is the structural answer to the role injection contract of 08 §24.10.
    expect(verifyDevelopmentToken(token, POLICY)).toBe('dev|practice-admin');
  });

  it('never puts token material or the secret into its error message', () => {
    const message = new DevelopmentTokenError('INVALID_SIGNATURE').message;

    expect(message).toBe('Development token rejected: INVALID_SIGNATURE.');
    expect(message).not.toContain(POLICY.secret);
  });
});
