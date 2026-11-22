import { nativeWebSocket } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildEndingResponse } from './build-ending-response';

export interface FrontProxyTargets {
  readonly apiURL: string;
  readonly webURL: string;
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
  const answerRequest = (request: Request, server: Bun.Server<BridgeData>) => {
    const url = new URL(request.url);

    const target = url.pathname.startsWith('/rpc/') ? targets.apiURL : targets.webURL;

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

    const forwarded = fetch(new Request(`${target}${url.pathname}${url.search}`, request), {
      redirect: 'manual',
    });

    return forwarded.then(
      (response) => buildEndingResponse(response),
      () => new Response(null, { status: 502 }),
    );
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
