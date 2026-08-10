import { Socket } from 'node:net';

import { type NetworkEndpoint } from '../../config/app-config.service.js';
import { type DependencyStatus } from '../domain/dependency-status.js';

/**
 * Reachability probe for a TCP dependency.
 *
 * Phase 1 has no database or queue client yet (04 §3.4 forbids Prisma models and queue
 * jobs), so readiness proves that the dependency accepts connections — nothing more. The
 * phase that introduces the real client replaces this with a protocol level check.
 *
 * The probe never logs or returns the endpoint, because connection strings are forbidden
 * log content (09 §11).
 */
export function probeTcpEndpoint(
  endpoint: NetworkEndpoint,
  timeoutMs: number,
): Promise<DependencyStatus> {
  return new Promise<DependencyStatus>((resolve) => {
    const socket = new Socket();
    let settled = false;

    const settle = (status: DependencyStatus): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(status);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      settle('up');
    });
    socket.once('timeout', () => {
      settle('down');
    });
    socket.once('error', () => {
      settle('down');
    });

    socket.connect(endpoint.port, endpoint.host);
  });
}
