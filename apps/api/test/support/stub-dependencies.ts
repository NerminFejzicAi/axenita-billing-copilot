import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import {
  type AddressInfo,
  createServer as createTcpServer,
  type Server as TcpServer,
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

function listenTcp(): Promise<TcpServer> {
  return new Promise((resolve) => {
    const server = createTcpServer();
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
