/**
 * Guard contract (`03` §3.1, `09` §5).
 *
 * Two properties matter here and nothing else: which error code each rejection carries, and the
 * refusal to exist in production.
 */

import { createHmac } from 'node:crypto';

import { type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ApiException } from '../../common/errors/api-exception.js';
import { type AppConfigService } from '../../config/app-config.service.js';
import { NodeEnvironment } from '../../config/environment.constants.js';
import {
  DevelopmentAuthGuard,
  readVerifiedAuthSubject,
  type AuthenticatedRequest,
} from './development-auth.guard.js';

const SECRET = 'test_only_development_auth_secret_value_32+';
const ISSUER = 'axenita-development';
const AUDIENCE = 'axenita-api';

/**
 * The two configuration properties the guard reads, plus the production flag.
 *
 * Written as a structural stand-in rather than a full `AppConfigService`, because the guard
 * depends on four getters and instantiating the real service would drag in `ConfigService`.
 */
function configuration(nodeEnvironment: NodeEnvironment): AppConfigService {
  return {
    isProduction: nodeEnvironment === NodeEnvironment.Production,
    nodeEnvironment,
    developmentAuthSecret: SECRET,
    developmentAuthIssuer: ISSUER,
    developmentAuthAudience: AUDIENCE,
  } as AppConfigService;
}

function token(claims: Readonly<Record<string, unknown>>, secret = SECRET): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

  const signingInput = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;

  return `${signingInput}.${createHmac('sha256', secret).update(signingInput).digest('base64url')}`;
}

function validToken(subject = 'dev|practice-admin', secret = SECRET): string {
  return token(
    {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: subject,
      exp: Math.floor(Date.now() / 1000) + 300,
    },
    secret,
  );
}

function contextWith(authorization?: string): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  } as unknown as AuthenticatedRequest;

  const context = {
    switchToHttp: () => ({ getRequest: <T>(): T => request as T }),
  } as unknown as ExecutionContext;

  return { context, request };
}

function guard(nodeEnvironment = NodeEnvironment.Test): DevelopmentAuthGuard {
  return new DevelopmentAuthGuard(configuration(nodeEnvironment));
}

describe('DevelopmentAuthGuard', () => {
  it('refuses to be constructed in production, which fails process startup (09 §5)', () => {
    expect(() => guard(NodeEnvironment.Production)).toThrow(/never be enabled in production/);
  });

  it.each([NodeEnvironment.Development, NodeEnvironment.Test])(
    'is constructible in %s',
    (nodeEnvironment) => {
      expect(() => guard(nodeEnvironment)).not.toThrow();
    },
  );

  it('attaches the verified subject to the request', () => {
    const { context, request } = contextWith(`Bearer ${validToken('dev|physician')}`);

    expect(guard().canActivate(context)).toBe(true);
    expect(readVerifiedAuthSubject(request)).toBe('dev|physician');
  });

  it('accepts the scheme case-insensitively, as HTTP requires', () => {
    const { context, request } = contextWith(`bearer ${validToken()}`);

    expect(guard().canActivate(context)).toBe(true);
    expect(readVerifiedAuthSubject(request)).toBe('dev|practice-admin');
  });

  it.each([
    ['no Authorization header at all', undefined],
    ['an empty bearer credential', 'Bearer '],
    ['a Basic credential', 'Basic dXNlcjpwYXNz'],
    ['a bare token without a scheme', validToken()],
  ])('answers 401 AUTHENTICATION_REQUIRED for %s', (_label, authorization) => {
    const { context, request } = contextWith(authorization);

    try {
      guard().canActivate(context);
      throw new Error('The guard accepted a request that presented no bearer credential.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).code).toBe('AUTHENTICATION_REQUIRED');
      expect((error as ApiException).getStatus()).toBe(401);
    }

    expect(readVerifiedAuthSubject(request)).toBeUndefined();
  });

  it.each([
    ['a malformed token', 'Bearer not-a-token'],
    [
      'a token signed with another secret',
      `Bearer ${validToken('dev|physician', 'other_secret_value_at_least_32_chars')}`,
    ],
  ])('answers 401 INVALID_TOKEN for %s (03 §3.1)', (_label, authorization) => {
    const { context, request } = contextWith(authorization);

    try {
      guard().canActivate(context);
      throw new Error('The guard accepted a credential that failed verification.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).code).toBe('INVALID_TOKEN');
      expect((error as ApiException).getStatus()).toBe(401);
    }

    expect(readVerifiedAuthSubject(request)).toBeUndefined();
  });

  it('never echoes token material in the rejection detail (09 §11)', () => {
    const credential = validToken('dev|physician', 'other_secret_value_at_least_32_chars');
    const { context } = contextWith(`Bearer ${credential}`);

    try {
      guard().canActivate(context);
      throw new Error('The guard accepted a credential that failed verification.');
    } catch (error) {
      const detail = (error as ApiException).detail;
      expect(detail).toBe('The presented token is not valid.');
      expect(detail).not.toContain(credential);
      expect(detail).not.toContain(SECRET);
    }
  });
});
