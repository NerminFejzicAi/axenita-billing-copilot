import { type NextFunction, type Request, type Response } from 'express';
import { describe, expect, it, type Mock, vi } from 'vitest';

import { REQUEST_ID_HEADER, REQUEST_ID_HEADER_NAME } from './request-context.constants.js';
import { getRequestId } from './request-context.storage.js';
import { requestIdMiddleware } from './request-id.middleware.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Express's `NextFunction` is an overloaded interface. A single-signature spy that accepts
 * `unknown` satisfies every overload, which keeps the mock both typed and assignable.
 */
type NextSpy = Mock<(error?: unknown) => void>;

interface Harness {
  readonly request: Request;
  readonly response: Response;
  readonly next: NextSpy;
  readonly setHeader: Mock<(name: string, value: string) => void>;
}

function harness(incoming?: string | string[]): Harness {
  const setHeader = vi.fn<(name: string, value: string) => void>();
  const headers: Record<string, string | string[] | undefined> = {};
  if (incoming !== undefined) {
    headers[REQUEST_ID_HEADER] = incoming;
  }

  return {
    request: { headers } as unknown as Request,
    response: { setHeader } as unknown as Response,
    next: vi.fn<(error?: unknown) => void>(),
    setHeader,
  };
}

function capturedRequestId(setHeader: Mock<(name: string, value: string) => void>): string {
  const call = setHeader.mock.calls[0];
  expect(call?.[0]).toBe(REQUEST_ID_HEADER_NAME);
  return String(call?.[1]);
}

describe('requestIdMiddleware', () => {
  it('given no incoming header when handled then a UUID is generated and echoed', () => {
    const { request, response, next, setHeader } = harness();

    requestIdMiddleware(request, response, next);

    expect(capturedRequestId(setHeader)).toMatch(UUID_PATTERN);
    expect(next).toHaveBeenCalledOnce();
  });

  it('given a valid incoming UUID when handled then it is reused', () => {
    const incoming = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const { request, response, next, setHeader } = harness(incoming);

    requestIdMiddleware(request, response, next);

    expect(capturedRequestId(setHeader)).toBe(incoming);
  });

  it.each([
    ['not-a-uuid'],
    [''],
    ['3f2504e0-4f89-41d3-9a0c-0305e82c3301-extra'],
    ['<script>alert(1)</script>'],
  ])('given the untrusted value %s when handled then a fresh UUID replaces it', (incoming) => {
    const { request, response, next, setHeader } = harness(incoming);

    requestIdMiddleware(request, response, next);

    const emitted = capturedRequestId(setHeader);
    expect(emitted).toMatch(UUID_PATTERN);
    expect(emitted).not.toBe(incoming);
  });

  it('given a repeated header when handled then only the first value is considered', () => {
    const first = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const { request, response, next, setHeader } = harness([first, 'not-a-uuid']);

    requestIdMiddleware(request, response, next);

    expect(capturedRequestId(setHeader)).toBe(first);
  });

  it('given a request when handled then the id is readable from the async context', () => {
    const { request, response, setHeader } = harness();
    let observed: string | undefined;

    const next: NextFunction = () => {
      observed = getRequestId();
    };

    requestIdMiddleware(request, response, next);

    expect(observed).toBe(capturedRequestId(setHeader));
  });

  it('given no active request when queried then the context is undefined', () => {
    expect(getRequestId()).toBeUndefined();
  });
});
