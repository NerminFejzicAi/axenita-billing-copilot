/**
 * Phase 3 authentication guard (`04` §5.2 "kontrolisani dev auth guard", `04` §6.5 middleware
 * order "faza 3 auth guard -> faza 4 practice guard").
 *
 * It performs step 1 of `03` §3.7.1 and nothing else: verify the bearer credential and attach
 * the verified subject to the request. It opens no transaction, touches no database, resolves no
 * user and establishes no context — steps 2 and onward belong to the identity bootstrap, and
 * `03` §3.1 requires token verification to be complete before the first database context call.
 *
 * ISOLATION FROM PRODUCTION (`09` §5, `13` §1)
 *
 * The constructor refuses to build under `NODE_ENV=production`. Because this guard is a provider
 * of a module the root module imports, that refusal is a STARTUP failure, not a per-request one:
 * a production process cannot come up with development authentication wired in. The real OIDC
 * provider is an open external dependency and is not implemented here.
 */

import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { type Request } from 'express';

import { AppConfigService } from '../../config/app-config.service.js';
import { authenticationRequired, invalidToken } from '../identity.errors.js';
import { verifyDevelopmentToken } from './development-token.js';

/** The scheme of `Authorization: Bearer <token>` (`00` §8.2, `03` §3.1). */
const BEARER_SCHEME = 'bearer';

/**
 * A request that carries a verified authentication subject.
 *
 * The property is written by this guard only. Nothing else may set it, and in particular no
 * request body, query parameter or other header can reach it (`02` §16.2a, D-047 clause 20).
 */
export interface AuthenticatedRequest extends Request {
  verifiedAuthSubject?: string;
}

/** Reads the subject the guard attached. Returns `undefined` when the guard did not run. */
export function readVerifiedAuthSubject(request: AuthenticatedRequest): string | undefined {
  return request.verifiedAuthSubject;
}

@Injectable()
export class DevelopmentAuthGuard implements CanActivate {
  public constructor(private readonly appConfig: AppConfigService) {
    if (appConfig.isProduction) {
      // Names no value and reads no secret (09 §9, §11).
      throw new Error(
        'Development authentication must never be enabled in production (09 §5). The production ' +
          'identity provider is an open external dependency (13 §1).',
      );
    }
  }

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers.authorization);

    if (token === undefined) {
      throw authenticationRequired();
    }

    try {
      request.verifiedAuthSubject = verifyDevelopmentToken(token, {
        secret: this.appConfig.developmentAuthSecret,
        issuer: this.appConfig.developmentAuthIssuer,
        audience: this.appConfig.developmentAuthAudience,
        now: Date.now(),
      });
    } catch {
      // The failure reason stays inside the verifier. Every refusal answers 401 with the same
      // static document (03 §3.1), and the exception text — which could echo token material —
      // is never propagated or logged.
      throw invalidToken();
    }

    return true;
  }
}

/**
 * Extracts the token of an `Authorization: Bearer <token>` header.
 *
 * Returns `undefined` when no bearer credential was presented at all — a missing header, a
 * different scheme, or an empty token. That case is `AUTHENTICATION_REQUIRED`; a presented
 * bearer credential that fails verification is `INVALID_TOKEN` (`03` §3.1).
 */
function readBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  const separator = header.indexOf(' ');

  if (separator < 0) {
    return undefined;
  }

  const scheme = header.slice(0, separator);
  const credential = header.slice(separator + 1).trim();

  if (scheme.toLowerCase() !== BEARER_SCHEME || credential.length === 0) {
    return undefined;
  }

  return credential;
}
