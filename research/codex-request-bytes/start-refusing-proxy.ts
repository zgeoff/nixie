import { createServer } from 'node:net';

export interface RefusingProxy {
  readonly url: string;

  // the first line of each request the CLI sent through the proxy, such as `CONNECT host:443`
  readonly attempts: string[];
  readonly stop: () => Promise<void>;
}

// The CLI's proxy for every host outside 127.0.0.1. It keeps the first line of each request and
// answers 403, so a run reaches no outside host and still shows each one the CLI tried.
export function startRefusingProxy(): Promise<RefusingProxy> {
  const attempts: string[] = [];
  const server = createServer((socket) => {
    socket.once('data', (chunk) => {
      attempts.push(chunk.toString('latin1').split('\r\n')[0] ?? '');
      socket.end('HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
    });
    socket.on('error', () => {
      // the CLI may close its side first, which is no fault of the run
    });
  });
  const { promise, resolve } = Promise.withResolvers<RefusingProxy>();

  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    resolve({
      url: `http://127.0.0.1:${String(port)}`,
      attempts,
      stop: async () => {
        const closed = Promise.withResolvers<void>();

        server.close(() => {
          closed.resolve();
        });
        await closed.promise;
      },
    });
  });

  return promise;
}
