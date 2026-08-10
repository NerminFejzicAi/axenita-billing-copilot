import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createTcpServer, type Server as TcpServer } from 'node:net';
import { type AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { probeHttpEndpoint } from './http-dependency.probe.js';
import { probeTcpEndpoint } from './tcp-dependency.probe.js';

const TIMEOUT_MS = 1000;

/** A port nothing listens on. Connecting is refused immediately on loopback. */
const CLOSED_PORT = 1;

function listeningPort(server: TcpServer | HttpServer): number {
  return (server.address() as AddressInfo).port;
}

describe('probeTcpEndpoint', () => {
  let server: TcpServer;

  beforeAll(async () => {
    server = createTcpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('given a listening endpoint when probed then it reports up', async () => {
    await expect(
      probeTcpEndpoint({ host: '127.0.0.1', port: listeningPort(server) }, TIMEOUT_MS),
    ).resolves.toBe('up');
  });

  it('given a closed port when probed then it reports down', async () => {
    await expect(
      probeTcpEndpoint({ host: '127.0.0.1', port: CLOSED_PORT }, TIMEOUT_MS),
    ).resolves.toBe('down');
  });

  it('given an unresolvable host when probed then it reports down', async () => {
    await expect(probeTcpEndpoint({ host: 'host.invalid', port: 5432 }, TIMEOUT_MS)).resolves.toBe(
      'down',
    );
  });
});

describe('probeHttpEndpoint', () => {
  let server: HttpServer;

  beforeAll(async () => {
    server = createHttpServer((request, response) => {
      if (request.url === '/healthy') {
        response.writeHead(200).end('ok');
        return;
      }
      response.writeHead(503).end('unavailable');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('given a 2xx health response when probed then it reports up', async () => {
    const url = `http://127.0.0.1:${listeningPort(server)}/healthy`;

    await expect(probeHttpEndpoint(url, TIMEOUT_MS)).resolves.toBe('up');
  });

  it('given a non-2xx health response when probed then it reports down', async () => {
    const url = `http://127.0.0.1:${listeningPort(server)}/unhealthy`;

    await expect(probeHttpEndpoint(url, TIMEOUT_MS)).resolves.toBe('down');
  });

  it('given an unreachable endpoint when probed then it reports down', async () => {
    await expect(
      probeHttpEndpoint(`http://127.0.0.1:${CLOSED_PORT}/minio/health/live`, TIMEOUT_MS),
    ).resolves.toBe('down');
  });
});
