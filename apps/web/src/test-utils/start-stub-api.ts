import { onTestFinished } from 'bun:test';
import { runMockAPIRequest } from '../mocks/run-mock-api-request';

interface StubAPIRequest {
  readonly authorization: string | null;
  readonly cookie: string | null;
  readonly path: string;
}

export function startStubAPI() {
  const requests: StubAPIRequest[] = [];

  const answerRequest = (request: Request) => {
    requests.push({
      authorization: request.headers.get('authorization'),
      cookie: request.headers.get('cookie'),
      path: new URL(request.url).pathname,
    });

    return runMockAPIRequest(request);
  };

  const server = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await server.stop(true);
  });

  return { requests, url: `http://127.0.0.1:${server.port}` };
}
