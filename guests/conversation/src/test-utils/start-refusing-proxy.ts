export interface RefusingProxy {
  readonly url: string;

  readonly targets: () => readonly string[];

  readonly stop: () => void;
}

// A request the proxy left unanswered would fail a test only at its time limit, with no host named,
// so the proxy refuses each request at once and lists its target.
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
    },
  };
}

function parseTarget(request: string): string {
  const [requestLine = ''] = request.split('\r\n', 1);

  return requestLine.split(' ')[1] ?? requestLine;
}
