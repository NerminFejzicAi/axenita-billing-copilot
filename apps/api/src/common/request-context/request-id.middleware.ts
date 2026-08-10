import { randomUUID } from 'node:crypto';

import { type NextFunction, type Request, type Response } from 'express';

import { REQUEST_ID_HEADER, REQUEST_ID_HEADER_NAME } from './request-context.constants.js';
import { runWithRequestContext } from './request-context.storage.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Correlation id foundation (03 §3.5).
 *
 * - a client supplied `X-Request-ID` is reused only when it is a valid UUID;
 * - any other client value is replaced by a freshly generated UUID, because an untrusted,
 *   arbitrary length string would flow into logs and into every Problem Details document;
 * - the server always echoes `X-Request-ID` back on the response;
 * - the id is bound to the async execution path so that the exception filter and the logger
 *   can read it without threading it through every call.
 */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId =
    typeof candidate === 'string' && UUID_PATTERN.test(candidate) ? candidate : randomUUID();

  response.setHeader(REQUEST_ID_HEADER_NAME, requestId);

  runWithRequestContext({ requestId }, () => {
    next();
  });
}
