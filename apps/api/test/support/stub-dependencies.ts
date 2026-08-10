import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import {
  type AddressInfo,
  createServer as createTcpServer,
  type Server as TcpServer,
  type Socket,
} from 'node:net';

/**
 * In-process stand-ins for the local infrastructure dependencies.
 *
 * They let the readiness end-to-end tests assert both the healthy and the degraded path
 * deterministically, without requiring a running Docker stack in every environment.
 * Real container health is verified separately by the phase 1 acceptance commands
 * (04 §3.6).
 */
export interface StubbedDependencies {
  /** Environment overrides that point the readiness probes at the stubs. */
  readonly environment: Readonly<Record<string, string>>;
  readonly close: () => Promise<void>;
}

function port(server: TcpServer | HttpServer): number {
  return (server.address() as AddressInfo).port;
}

/**
 * Sockets accepted by a stub, so teardown can drop them.
 *
 * `net.Server` has no `closeAllConnections` — that method exists only on `http.Server` —
 * and `server.close()` waits for every open connection. A peer such as the PostgreSQL
 * driver keeps its socket open waiting for a reply it will never get, so without this the
 * suite would hang in teardown.
 */
const openSockets = new WeakMap<TcpServer, Set<Socket>>();

/**
 * A bare TCP listener that accepts a connection and then says nothing.
 *
 * It never completes a protocol handshake, which is the point: a client that only checks
 * reachability sees `up`, while a client that actually speaks the protocol does not.
 */
function listenTcp(): Promise<TcpServer> {
  return new Promise((resolve) => {
    const sockets = new Set<Socket>();
    const server = createTcpServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {
        socket.destroy();
      });
    });

    openSockets.set(server, sockets);

    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function listenObjectStorage(): Promise<HttpServer> {
  return new Promise((resolve) => {
    const server = createHttpServer((request, response) => {
      if (request.url === '/minio/health/live') {
        response.writeHead(200).end();
        return;
      }
      response.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function close(server: TcpServer | HttpServer): Promise<void> {
  // Drop peers first: `close` only stops accepting and then waits for existing connections.
  for (const socket of openSockets.get(server) ?? []) {
    socket.destroy();
  }
  if ('closeAllConnections' in server) {
    server.closeAllConnections();
  }

  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

/** Starts stubs that make every readiness dependency report `up`. */
export async function startHealthyDependencies(): Promise<StubbedDependencies> {
  const database = await listenTcp();
  const redis = await listenTcp();
  const objectStorage = await listenObjectStorage();

  return {
    environment: {
      DATABASE_URL: `postgresql://test_user:test_password@127.0.0.1:${port(database)}/copilot_test`,
      REDIS_URL: `redis://127.0.0.1:${port(redis)}`,
      OBJECT_STORAGE_ENDPOINT: `http://127.0.0.1:${port(objectStorage)}`,
      OBJECT_STORAGE_HEALTH_PATH: '/minio/health/live',
    },
    close: async (): Promise<void> => {
      await Promise.all([close(database), close(redis), close(objectStorage)]);
    },
  };
}

/** Environment overrides that point every dependency at a closed local port. */
export const UNREACHABLE_DEPENDENCIES: Readonly<Record<string, string>> = {
  DATABASE_URL: 'postgresql://test_user:test_password@127.0.0.1:1/copilot_test',
  REDIS_URL: 'redis://127.0.0.1:1',
  OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:1',
  OBJECT_STORAGE_HEALTH_PATH: '/minio/health/live',
};
