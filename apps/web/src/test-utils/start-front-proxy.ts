import { onTestFinished } from 'bun:test';

interface FrontProxyTargets {
  readonly apiURL: string;
  readonly webURL: string;
}

// Serves the web server and the API on one loopback origin, as the reverse proxy in front of
// nixie does, so a browser calls /rpc on the origin of the page it loaded. A server behind it that
// is down gets a 502, as from the reverse proxy, so a test that stops its servers raises no error.
export function startFrontProxy(targets: FrontProxyTargets) {
  const server = Bun.serve({
    fetch(request) {
      const url = new URL(request.url);

      const target = url.pathname.startsWith('/rpc/') ? targets.apiURL : targets.webURL;

      const forwarded = fetch(new Request(`${target}${url.pathname}${url.search}`, request), {
        redirect: 'manual',
      });

      return forwarded.catch(() => new Response(null, { status: 502 }));
    },
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await server.stop(true);
  });

  return { url: `http://127.0.0.1:${server.port}` };
}
