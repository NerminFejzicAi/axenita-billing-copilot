import { type DependencyStatus } from '../domain/dependency-status.js';

/**
 * Health probe for an HTTP dependency, used for the S3-compatible object storage.
 *
 * Any transport error, timeout or non-2xx response counts as `down`. The response body is
 * discarded and never logged: a dependency health payload is not part of this API's
 * contract and could carry internal detail (03 §27, 09 §11).
 */
export async function probeHttpEndpoint(url: string, timeoutMs: number): Promise<DependencyStatus> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    await response.body?.cancel();

    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}
