import { buildEndingResponse } from './build-ending-response';

export interface FrontProxyTargets {
  readonly apiURL: string;
  readonly webURL: string;
}

// One origin in front of the API and the web server, as a deployment's ingress is: the API's paths
// go to the API, and every other path to the web server.
export function createFrontProxy(targets: FrontProxyTargets): Bun.Server<undefined> {
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

  return Bun.serve({ fetch: forwardRequest, hostname: '127.0.0.1', port: 0 });
}
