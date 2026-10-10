import { onTestFinished } from 'bun:test';
import { runMockAPIRequest } from '../mocks/run-mock-api-request';

export interface StubAPIRequest {
  readonly authorization: string | null;
  readonly cookie: string | null;
  readonly path: string;
}

// Serves the mock API on a loopback port for a process outside the test, such as the built web
// server, and records the credentials each request carried.
export function startStubAPI() {
  const requests: StubAPIRequest[] = [];
  const server = Bun.serve({
    fetch(request) {
      requests.push({
        authorization: request.headers.get('authorization'),
        cookie: request.headers.get('cookie'),
        path: new URL(request.url).pathname,
      });

      return runMockAPIRequest(request);
    },
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await server.stop(true);
  });

  return { requests, url: `http://127.0.0.1:${server.port}` };
}
