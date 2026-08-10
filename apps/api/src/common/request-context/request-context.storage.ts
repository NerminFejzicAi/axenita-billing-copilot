import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request technical context.
 *
 * Only pseudonymised technical identifiers may ever be added here. Patient data, medical
 * text, tokens and credentials are forbidden (09 §11, 00 §8).
 */
export interface RequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `callback` with the given request context bound to the async execution path. */
export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

/** Returns the current request context, or `undefined` outside of a request. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Returns the correlation id of the current request.
 *
 * Returns `undefined` outside of an HTTP request (for example during bootstrap), so callers
 * must not assume a value exists.
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
