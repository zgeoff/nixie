import { onTestFinished } from 'bun:test';
import { runMockAPIRequest } from '../mocks/run-mock-api-request';

interface StubAPIRequest {
  readonly authorization: string | null;
  readonly cookie: string | null;
  readonly path: string;
}

export function startStubAPI() {
  const requests: StubAPIRequest[] = [];

  const delaysMs = new Map<string, number>();
  const holds = new Map<string, PromiseWithResolvers<void>>();

  const answerRequest = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;

    requests.push({
      authorization: request.headers.get('authorization'),
      cookie: request.headers.get('cookie'),
      path,
    });

    const delayMs = delaysMs.get(path);

    if (delayMs !== undefined) {
      await Bun.sleep(delayMs);
    }

    await holds.get(path)?.promise;

    return runMockAPIRequest(request);
  };

  const server = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    for (const hold of holds.values()) {
      hold.resolve();
    }

    await server.stop(true);
  });

  return {
    requests,
    url: `http://127.0.0.1:${server.port}`,

    // Holds back each answer to this path, so a test sees the page before the data lands.
    delayPath: (path: string, delayMs: number) => {
      delaysMs.set(path, delayMs);
    },

    // Holds every answer to this path until the returned release runs, so a test changes data that
    // the page cannot read yet.
    holdPath: (path: string): (() => void) => {
      const hold = Promise.withResolvers<void>();

      holds.set(path, hold);

      return () => {
        holds.delete(path);
        hold.resolve();
      };
    },
  };
}
