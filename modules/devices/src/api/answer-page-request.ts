import type { APIContext } from '@heynixie/api';
import { devicePagePaths } from '@heynixie/contract';
import { readPackageFile } from '../package/read-package-file';
import { readPageFrame } from '../page/read-page-frame';
import { readPageImage } from '../page/read-page-image';
import type { DeviceStreams } from '../stream/create-device-streams';

// Answers a request for a page's frame or one of its images, or returns null for any other path.
// The frame's opaque origin sends no session cookie and no client header, so the ticket in the path
// is the whole check: a ticket that nobody issued, or that new content replaced, gets a 404.
export function answerPageRequest(
  streams: DeviceStreams,
  context: APIContext,
  request: Request,
): Promise<Response> | null {
  const url = new URL(request.url);

  if (url.pathname.startsWith(devicePagePaths.frames)) {
    return request.method === 'GET'
      ? serveFrame(streams, context, url.pathname.slice(devicePagePaths.frames.length), request)
      : Promise.resolve(new Response('not found', { status: 404 }));
  }

  if (url.pathname.startsWith(devicePagePaths.images)) {
    return request.method === 'GET'
      ? serveImage(streams, context, url.pathname.slice(devicePagePaths.images.length))
      : Promise.resolve(new Response('not found', { status: 404 }));
  }

  if (url.pathname.startsWith(devicePagePaths.packages)) {
    return request.method === 'GET'
      ? servePackageFile(context, url.pathname.slice(devicePagePaths.packages.length))
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
  streams: DeviceStreams,
  context: APIContext,
  ticket: string,
  request: Request,
): Promise<Response> {
  const frame = await readPageFrame(
    { log: context.log, nowMs: context.clock.now(), streams },
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

async function serveImage(
  streams: DeviceStreams,
  context: APIContext,
  ticket: string,
): Promise<Response> {
  const image = await readPageImage(
    { log: context.log, nowMs: context.clock.now(), streams },
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

// the name, the version and the path of a package file: `chart.js@4.4.6/dist/chart.umd.js`, or
// `@scope/pkg@1.0.0/index.js` for a scoped name
const packagePathPattern = /^(?<name>(?:@[^/@]+\/)?[^/@]+)@(?<version>[^/]+)\/(?<path>.+)$/u;

// A file of an approved package. The page's opaque origin sends no session cookie, and nothing but
// public npm code lives here, so the route asks for nothing and any origin may load a file, as a
// module script or a font needs. The file is found by its path in the package's stored list.
async function servePackageFile(context: APIContext, requested: string): Promise<Response> {
  const groups = packagePathPattern.exec(decodeRequestPath(requested))?.groups;

  if (
    groups?.['name'] === undefined ||
    groups['version'] === undefined ||
    groups['path'] === undefined
  ) {
    return new Response('not found', { status: 404 });
  }

  const file = await readPackageFile(
    { db: context.log.writer.db, dataDir: context.log.writer.dataDir },
    { name: groups['name'], version: groups['version'], path: groups['path'] },
  );

  if (file === null) {
    return new Response('not found', { status: 404 });
  }

  return new Response(file.bytes, {
    headers: {
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'access-control-allow-origin': '*',
      'content-type': file.mediaType,
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}

function decodeRequestPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return '';
  }
}
