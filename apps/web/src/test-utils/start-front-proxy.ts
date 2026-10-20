import { onTestFinished } from 'bun:test';

interface FrontProxyTargets {
  readonly apiURL: string;
  readonly webURL: string;
}

// Serves the web server and the API on one loopback origin, as the reverse proxy in front of
// nixie does, so a browser calls /rpc on the origin of the page it loaded. Like the reverse proxy, it
// answers 502 for a server that is down, and ends a stream whose server stops partway.
export function startFrontProxy(targets: FrontProxyTargets) {
  const forwardRequest = (request: Request) => {
    const url = new URL(request.url);

    const target = url.pathname.startsWith('/rpc/') ? targets.apiURL : targets.webURL;

    const forwarded = fetch(new Request(`${target}${url.pathname}${url.search}`, request), {
      redirect: 'manual',
    });

    return forwarded.then(
      (response) => buildEndingResponse(response),
      () => new Response(null, { status: 502 }),
    );
  };

  const server = Bun.serve({
    fetch: forwardRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await server.stop(true);
  });

  return { url: `http://127.0.0.1:${server.port}` };
}

// a test stops its servers while the page may still follow the live stream, so a body that fails
// partway ends there rather than raise an error between tests
function buildEndingResponse(response: Response): Response {
  if (response.body === null) {
    return response;
  }

  const reader = response.body.getReader();

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));

      if (chunk.done) {
        controller.close();
      } else {
        controller.enqueue(chunk.value);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });

  return new Response(body, response);
}
