/**
 * The four failures the phase 3 identity slice is allowed to produce.
 *
 * Normative sources: `03` §3.1 (`401 INVALID_TOKEN` is reserved exclusively for a failed token
 * verification; a cryptographically valid token whose verified subject has no `users` row is an
 * admission failure and therefore `403 ACCESS_DENIED`), `03` §8 (frozen error catalogue) and
 * `03` §9 (status usage). D-047 clauses 3–4 and `14` §2 fix the same two rejections.
 *
 * Every factory returns an {@link ApiException}, so the response is rendered by the single
 * Problem Details filter (D-008) and no endpoint can invent an error shape.
 *
 * The `detail` strings are static and deliberately uninformative. `03` §3.1 requires the answer
 * to an unknown subject and the answer to a known but non-`ACTIVE` user to be INDISTINGUISHABLE,
 * and to disclose no membership or tenant information. They also never carry SQL, a connection
 * string, an `auth_subject`, a stack trace or any internal identifier (`09` §11, `03` §1).
 */

import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../common/errors/api-exception.js';

/** No bearer credential was presented at all (`03` §3.1, `08` §8). */
export function authenticationRequired(): ApiException {
  return new ApiException({
    code: 'AUTHENTICATION_REQUIRED',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'Authentication is required.',
  });
}

/**
 * A bearer credential was presented and failed verification — signature, issuer, audience,
 * expiration or subject (`03` §3.1). This is the ONLY situation that may use this code.
 */
export function invalidToken(): ApiException {
  return new ApiException({
    code: 'INVALID_TOKEN',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'The presented token is not valid.',
  });
}

/**
 * Admission failed: the verified subject has no `users` row, or the resolved user is not
 * `ACTIVE` (`03` §3.1, D-047 clauses 3–4).
 *
 * Both cases return this one exception with this one detail, on purpose. Distinguishing them
 * would let an unauthenticated caller enumerate provisioned subjects.
 */
export function accessDenied(): ApiException {
  return new ApiException({
    code: 'ACCESS_DENIED',
    status: HttpStatus.FORBIDDEN,
    detail: 'Access denied.',
  });
}

/**
 * A database invariant the schema is supposed to guarantee did not hold.
 *
 * The only current example is more than one `users` row resolving for a single verified
 * subject, which `users_auth_subject_key` makes impossible. If it happens anyway, the correct
 * answer is a hard internal failure — never "pick the first row", which would silently choose an
 * identity for the caller.
 *
 * The message is server side only; the filter renders `500 INTERNAL_ERROR` with a static detail
 * and logs no exception text (`09` §11).
 */
export class IdentityInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'IdentityInvariantError';
  }
}
