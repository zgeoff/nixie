import { onTestFinished } from 'bun:test';

interface PageFrameFrontOptions {
  // the API that answers the frame's ticket path
  readonly apiURL: string;

  // the ticket of the page's frame, read when the host page loads, so a test can start the front
  // first and give its page the address of the server that counts requests
  readonly readFrame: () => string;
}

// the policy of the device page for what a frame may load and where a page may navigate
const hostPolicy = "default-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'";

// The host page keeps each message the frame posts, counts frame loads, and posts into the frame,
// also from a sibling frame, whose message the page must ignore.
const hostScript = `
  window.events = [];
  window.loads = 0;
  document.addEventListener('load', (event) => {
    if (event.target.tagName === 'IFRAME') {
      window.loads += 1;
    }
  }, true);
  addEventListener('message', (event) => {
    if (event.source === document.querySelector('iframe').contentWindow) {
      window.events.push(event.data);
    }
  });
  window.post = (data) => document.querySelector('iframe').contentWindow.postMessage(data, '*');
  window.spoof = () => {
    const sibling = document.createElement('iframe');
    sibling.sandbox = 'allow-scripts';
    sibling.srcdoc = '<script>parent.frames[0].postMessage({ nixie: true, type: "message", data: "spoof" }, "*")<\\/script>';
    document.body.append(sibling);
  };
`;

// Stands in for the device page and the reverse proxy in front of the API, so a browser loads the
// frame from its host page's origin. A second server counts each request that reaches it, which no
// sealed page may cause.
export function startPageFrameFront(options: PageFrameFrontOptions) {
  const evilRequests: string[] = [];
  const evilConnections = { count: 0 };

  // a raw TCP listener, so a connection that sends no request, such as a preconnect, counts too
  const evil = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      open: () => {
        evilConnections.count += 1;
      },
      data: (socket, data) => {
        const line = new TextDecoder().decode(data).split('\r\n')[0] ?? '';

        evilRequests.push(line.split(' ')[1] ?? '');

        socket.write(
          'HTTP/1.1 200 OK\r\nconnection: close\r\ncontent-length: 4\r\naccess-control-allow-origin: *\r\n\r\nevil',
        );

        socket.end();
      },
    },
  });

  const answerFront = (request: Request): Promise<Response> | Response => {
    const url = new URL(request.url);

    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === '/host') {
      return new Response(
        `<!doctype html><title>host</title><script>${hostScript}</script>` +
          `<iframe sandbox="allow-scripts" src="/rpc/device/frames/${options.readFrame()}" width="600" height="400"></iframe>`,
        { headers: { 'content-type': 'text/html', 'content-security-policy': hostPolicy } },
      );
    }

    return globalThis.fetch(`${options.apiURL}${url.pathname}${url.search}`, {
      method: request.method,
      headers: { 'x-forwarded-proto': 'http', 'x-forwarded-host': url.host },
    });
  };

  const front = Bun.serve({ fetch: answerFront, hostname: '127.0.0.1', port: 0 });

  onTestFinished(async () => {
    evil.stop(true);

    await front.stop(true);
  });

  return {
    evilRequests,
    evilConnections,
    evilOrigin: `http://127.0.0.1:${String(evil.port)}`,
    hostURL: `http://127.0.0.1:${String(front.port)}/host`,
  };
}
