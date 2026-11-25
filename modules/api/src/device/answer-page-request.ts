import { devicePagePaths } from '@heynixie/contract';
import { readPageFrame, readPageImage } from '@heynixie/devices';
import type { APIContext } from '../types';

// Answers a request for a page's frame or one of its images, or returns null for any other path.
// The frame's opaque origin sends no session cookie and no client header, so the ticket in the path
// is the whole check: a ticket that nobody issued, or that new content replaced, gets a 404.
export function answerPageRequest(context: APIContext, request: Request): Promise<Response> | null {
  const url = new URL(request.url);

  if (url.pathname.startsWith(devicePagePaths.frames)) {
    return request.method === 'GET'
      ? serveFrame(context, url.pathname.slice(devicePagePaths.frames.length), request)
      : Promise.resolve(new Response('not found', { status: 404 }));
  }

  if (url.pathname.startsWith(devicePagePaths.images)) {
    return request.method === 'GET'
      ? serveImage(context, url.pathname.slice(devicePagePaths.images.length))
      : Promise.resolve(new Response('not found', { status: 404 }));
  }

  return null;
}

// the headers of every answer: nothing may keep it, and nothing may read it as another type
const privateHeaders = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

async function serveFrame(
  context: APIContext,
  ticket: string,
  request: Request,
): Promise<Response> {
  const frame = await readPageFrame(
    { log: context.log, nowMs: context.clock.now(), streams: context.clients.devices },
    ticket,
    readRequestOrigin(request),
  );

  if (frame === null) {
    return new Response('not found', { status: 404 });
  }

  return new Response(frame.document, {
    headers: {
      ...privateHeaders,
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': frame.policy,
      'x-dns-prefetch-control': 'off',
    },
  });
}

// The origin the browser reached the API by, which the frame's policy names for its images. A
// reverse proxy that ends TLS says so in x-forwarded-proto, and the request's own URL says http. A
// forwarded value that is not a plain scheme or host is ignored, so it cannot add to the policy.
function readRequestOrigin(request: Request): string {
  const url = new URL(request.url);

  const proto =
    pickForwarded(request, 'x-forwarded-proto', /^https?$/u) ?? url.protocol.slice(0, -1);

  const host = pickForwarded(request, 'x-forwarded-host', /^[\w.:-]+$/u) ?? url.host;

  return `${proto}://${host}`;
}

function pickForwarded(request: Request, name: string, shape: RegExp): string | null {
  const value = request.headers.get(name)?.split(',')[0]?.trim() ?? '';

  return shape.test(value) ? value : null;
}

async function serveImage(context: APIContext, ticket: string): Promise<Response> {
  const image = await readPageImage(
    { log: context.log, nowMs: context.clock.now(), streams: context.clients.devices },
    ticket,
  );

  if (image === null) {
    return new Response('not found', { status: 404 });
  }

  return new Response(image.bytes, {
    headers: {
      ...privateHeaders,
      'content-type': image.mediaType,
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
