export interface LoopbackProbe {
  // a URL on the probe's loopback server
  readonly url: string;

  // the URL of each request that reached the server
  readonly hits: readonly string[];
  readonly stop: () => void;
}

// A loopback server that records each request it gets, so a test shows that a program under test
// never reached it.
export function startLoopbackProbe(): LoopbackProbe {
  const hits: string[] = [];

  const answerRequest = (request: Request): Response => {
    hits.push(request.url);

    return new Response('secret');
  };

  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: answerRequest });

  return {
    url: `http://127.0.0.1:${String(server.port)}/leak`,
    hits,
    stop: () => {
      void server.stop(true);
    },
  };
}
