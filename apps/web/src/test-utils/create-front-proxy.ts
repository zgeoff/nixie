import { nativeWebSocket } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildEndingResponse } from './build-ending-response';

export interface FrontProxyTargets {
  // a function names the address again on each request, for an API that restarts on a new port
  readonly apiURL: string | (() => string);
  readonly webURL: string;

  // runs with the path of each request the proxy sends to the API, a WebSocket upgrade included
  readonly onAPIRequest?: (pathname: string) => void;

  // a script that every HTML page runs before the page's own scripts, such as a microphone stand-in
  readonly headScript?: string;
}

interface BridgeData {
  readonly upstreamURL: string;
  readonly cookie: string | null;
  readonly pending: (string | Uint8Array<ArrayBuffer>)[];
  upstream: WebSocket | null;
}

// One origin in front of the API and the web server, as a deployment's ingress is: the API's paths
// go to the API, and every other path to the web server. A WebSocket upgrade on the API's paths is
// bridged to the API, so the browser's watch socket reaches it as it does behind an ingress.
export function createFrontProxy(targets: FrontProxyTargets): Bun.Server<BridgeData> {
  const answerRequest = async (request: Request, server: Bun.Server<BridgeData>) => {
    const url = new URL(request.url);

    const apiURL = typeof targets.apiURL === 'function' ? targets.apiURL() : targets.apiURL;
    const isAPIPath = url.pathname.startsWith('/rpc/');
    const target = isAPIPath ? apiURL : targets.webURL;

    if (isAPIPath) {
      targets.onAPIRequest?.(url.pathname);
    }

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const upstreamURL = `${target.replace(/^http/u, 'ws')}${url.pathname}${url.search}`;

      const data = {
        upstreamURL,
        cookie: request.headers.get('cookie'),
        pending: [],
        upstream: null,
      };

      return server.upgrade(request, { data }) ? undefined : new Response(null, { status: 502 });
    }

    const forwarded = new Request(`${target}${url.pathname}${url.search}`, request);

    let response: Response;

    try {
      response = await fetch(forwarded, { redirect: 'manual' });
    } catch {
      return new Response(null, { status: 502 });
    }

    if (targets.headScript !== undefined && isHTML(response)) {
      const injected = await injectHeadScript(response, targets.headScript);

      return buildEndingResponse(injected);
    }

    return buildEndingResponse(response);
  };

  return Bun.serve<BridgeData>({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
    websocket: {
      open: (socket) => {
        const headers = socket.data.cookie === null ? {} : { cookie: socket.data.cookie };

        // Bun's WebSocket takes a headers option that the DOM types leave out.
        const upstream: unknown = Reflect.construct(nativeWebSocket, [
          socket.data.upstreamURL,
          { headers },
        ]);

        invariant(upstream instanceof nativeWebSocket, 'the upstream is a WebSocket');

        upstream.binaryType = 'arraybuffer';
        socket.data.upstream = upstream;

        upstream.addEventListener('open', () => {
          for (const message of socket.data.pending) {
            upstream.send(message);
          }

          socket.data.pending.length = 0;
        });

        upstream.addEventListener('message', (event) => {
          const data: unknown = event.data;

          if (typeof data === 'string' || data instanceof ArrayBuffer) {
            socket.send(data);
          }
        });

        upstream.addEventListener('close', (event) => {
          const code = event.code === 1005 ? 1000 : event.code;

          socket.close(code);
        });

        upstream.addEventListener('error', () => {
          socket.close(1011);
        });
      },
      message: (socket, message) => {
        const upstream = socket.data.upstream;
        const copy = typeof message === 'string' ? message : new Uint8Array(message);

        if (upstream?.readyState === WebSocket.OPEN) {
          upstream.send(copy);
        } else {
          socket.data.pending.push(copy);
        }
      },
      close: (socket) => {
        socket.data.upstream?.close();
      },
    },
  });
}

function isHTML(response: Response): boolean {
  return response.headers.get('content-type')?.includes('text/html') ?? false;
}

async function injectHeadScript(response: Response, script: string): Promise<Response> {
  const html = await response.text();

  const injected = html.replace(/<head[^>]*>/u, (head) => `${head}<script>${script}</script>`);

  const headers = new Headers(response.headers);

  headers.delete('content-length');
  headers.delete('content-encoding');

  return new Response(injected, { status: response.status, headers });
}
