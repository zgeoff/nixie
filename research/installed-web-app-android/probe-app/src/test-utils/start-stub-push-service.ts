import { type Mock, mock, onTestFinished } from 'bun:test';

export interface StubPushService {
  // a push endpoint on the stub; a suffix makes another endpoint on the same stub
  endpoint: string;
  // the body and headers of each push the stub received, in order
  received: Mock<(body: Uint8Array<ArrayBuffer>, headers: Headers) => void>;
  stop: () => void;
}

// Stands in for a browser's push service on a loopback port: it records each push and answers
// every one with the given status. It stops when the test ends.
export function startStubPushService(status: number): StubPushService {
  const received = mock((_body: Uint8Array<ArrayBuffer>, _headers: Headers) => {});
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      received(new Uint8Array(await request.arrayBuffer()), request.headers);

      return new Response(null, { status });
    },
  });

  onTestFinished(() => server.stop(true));

  return {
    endpoint: new URL('/push/phone', server.url).href,
    received,
    stop: () => void server.stop(true),
  };
}
