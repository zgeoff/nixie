export interface RefusingProxy {
  readonly url: string;

  readonly targets: () => readonly string[];

  readonly stop: () => Promise<void>;
}

// A proxy that stalls would hang the client past the test's limit, so this one refuses at once and
// the test reads the host from the list.
export function startRefusingProxy(): RefusingProxy {
  const targets: string[] = [];

  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data(socket, request) {
        targets.push(parseTarget(request.toString()));
        socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      },
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    targets: () => [...targets],
    stop: () => {
      server.stop(true);

      return Promise.resolve();
    },
  };
}

function parseTarget(request: string): string {
  const [requestLine = ''] = request.split('\r\n', 1);

  return requestLine.split(' ')[1] ?? requestLine;
}
