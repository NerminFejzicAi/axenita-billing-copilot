import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';

import { AppConfigService } from '../../config/app-config.service.js';
import { ApiException } from '../errors/api-exception.js';
import { API_SERVICE_NAME, logAttributes } from '../observability/log-attributes.js';
import { REQUEST_ID_HEADER_NAME } from '../request-context/request-context.constants.js';
import { getRequestId } from '../request-context/request-context.storage.js';
import { PROBLEM_DETAILS_CONTENT_TYPE } from './problem-details.dto.js';
import {
  CLIENT_ERROR_MIN_STATUS,
  createProblemDetails,
  detailForStatus,
  errorCodeForStatus,
  SERVER_ERROR_MIN_STATUS,
} from './problem-details.factory.js';

/** Static log message for a server side failure. Contains no request or exception data. */
const UNHANDLED_FAILURE_MESSAGE = 'Unhandled request failure';

/**
 * Global exception filter that renders every failure as `application/problem+json`
 * (D-008, 03 §8).
 *
 * Guarantees:
 * - one single error shape for the whole API, so controllers never invent their own;
 * - no stack trace, SQL, secret, connection string or internal URL in the response body;
 * - a correlation id on every problem document (03 §3.5);
 * - unexpected exceptions collapse to `500 INTERNAL_ERROR` with a static explanation;
 * - the server side log line is static plus allowlisted metadata — the exception's own
 *   message and stack are discarded, never logged (09 §11).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  public constructor(private readonly appConfig: AppConfigService) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = resolveStatus(exception);
    const requestId = resolveRequestId(response);

    if (status >= SERVER_ERROR_MIN_STATUS) {
      // 09 §11 — structured allowlist logging.
      //
      // The exception itself is NEVER logged: neither its message nor its stack. An
      // exception raised deeper in the stack can carry SQL, a connection string, a
      // provider payload, an external identifier or medical text, and none of that may
      // reach a log line. Only the static message plus bounded technical metadata drawn
      // from the allowlist (`action`, `requestId`, `status`, `errorCode`) is emitted.
      //
      // Correlation is preserved through `requestId`: the same id is on the response
      // header and in the client's Problem Details document (03 §3.5).
      this.logger.error(
        logAttributes({
          message: UNHANDLED_FAILURE_MESSAGE,
          service: API_SERVICE_NAME,
          action: 'HTTP_REQUEST_FAILED',
          requestId,
          status,
          errorCode: errorCodeForStatus(status),
        }),
      );
    }

    const problem =
      exception instanceof ApiException
        ? createProblemDetails({
            code: exception.code,
            status,
            detail: exception.detail,
            instance: request.originalUrl,
            requestId,
            typeBaseUrl: this.appConfig.problemTypeBaseUrl,
            errors: exception.errors,
          })
        : createProblemDetails({
            code: errorCodeForStatus(status),
            status,
            detail: detailForStatus(status),
            instance: request.originalUrl,
            requestId,
            typeBaseUrl: this.appConfig.problemTypeBaseUrl,
          });

    response.setHeader('Content-Type', PROBLEM_DETAILS_CONTENT_TYPE);
    response.status(status).json(problem);
  }
}

function resolveStatus(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  if (isRequestParsingError(exception)) {
    return HttpStatus.BAD_REQUEST;
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * Recognises the `http-errors` objects raised by the body parser (malformed JSON, body
 * above the configured limit, unsupported charset, aborted request).
 *
 * They are client errors, not server failures, so they must not collapse to `500`. They are
 * reported as `400` because 03 §9 classifies `400` as the "header/query/request format"
 * status and states that `413` and `415` are not reachable while the active document path
 * accepts text only (03 §13.1). Introducing `413` here would contradict that statement.
 */
function isRequestParsingError(exception: unknown): boolean {
  if (!(exception instanceof Error)) {
    return false;
  }

  const candidate = exception as Error & { type?: unknown; status?: unknown };

  return (
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'number' &&
    candidate.status >= CLIENT_ERROR_MIN_STATUS &&
    candidate.status < SERVER_ERROR_MIN_STATUS
  );
}

/**
 * Reads the correlation id.
 *
 * The async local store is authoritative; the response header is a fallback for failures
 * raised outside the middleware chain. Both missing means the failure happened before the
 * request context existed, which must still produce a well formed document.
 */
function resolveRequestId(response: Response): string {
  const fromStore = getRequestId();
  if (fromStore !== undefined) {
    return fromStore;
  }

  const fromHeader = response.getHeader(REQUEST_ID_HEADER_NAME);
  return typeof fromHeader === 'string' ? fromHeader : 'unknown';
}
