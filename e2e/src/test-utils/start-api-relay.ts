import { onTestFinished } from 'bun:test';
import { buildEndingResponse } from '@heynixie/web/test-utils';

export interface APIRelay {
  readonly url: string;

  readonly retarget: (targetURL: string) => void;
}

// nixie listens on a new port each time it starts, while the web server keeps the API address it
// started with, as a deployment's does, so the relay holds one address across the starts.
export function startAPIRelay(): APIRelay {
  const target: { url: string | null } = { url: null };

  const forwardRequest = (request: Request) => {
    if (target.url === null) {
      return new Response(null, { status: 502 });
    }

    const url = new URL(request.url);

    return fetch(new Request(`${target.url}${url.pathname}${url.search}`, request), {
      redirect: 'manual',
    }).then(
      (response) => buildEndingResponse(response),
      () => new Response(null, { status: 502 }),
    );
  };

  const server = Bun.serve({ fetch: forwardRequest, hostname: '127.0.0.1', port: 0 });

  onTestFinished(async () => {
    await server.stop(true);
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    retarget: (targetURL) => {
      target.url = targetURL;
    },
  };
}
