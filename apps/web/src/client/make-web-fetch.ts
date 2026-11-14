import { join, sep } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { ORPCError, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

export interface WebFetchOptions {
  readonly apiURL: string;

  readonly clientDir: string;
  readonly startFetch: (request: Request) => Promise<Response> | Response;
}

export function makeWebFetch(options: WebFetchOptions) {
  const probe = buildProbeClient(options.apiURL);

  return async (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/health/live') {
      return Response.json({ status: 'live' });
    }

    if (pathname === '/health/ready') {
      return checkReadiness(probe);
    }

    const asset = await readBrowserAsset(options.clientDir, pathname);

    if (asset !== undefined) {
      return asset;
    }

    const page = await options.startFetch(request);

    return toPrivateResponse(page);
  };
}

function buildProbeClient(apiURL: string): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({ headers: { [clientHeaderName]: 'web' }, url: `${apiURL}/rpc` }),
  );
}

async function checkReadiness(probe: ContractClient): Promise<Response> {
  const reachable = await probeAPI(probe);

  return reachable
    ? Response.json({ status: 'ready' })
    : Response.json({ status: 'unready', unready: ['api'] }, { status: 503 });
}

// The API answers a call with no session with its typed refusal, which shows that it is up and
// speaks the contract.
async function probeAPI(probe: ContractClient): Promise<boolean> {
  try {
    await probe.sessions.list(undefined, { signal: AbortSignal.timeout(2000) });

    return true;
  } catch (error) {
    return error instanceof ORPCError && error.code === 'UNAUTHORIZED';
  }
}

// These names carry no hash, so the browser keeps each file for an hour only, and an installed
// app picks up a changed manifest or icon.
const publicPaths = new Set([
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]);

// The URL parser removes dot segments, and the prefix check refuses any path that still escapes
// the assets folder.
function readBrowserAsset(
  clientDir: string,
  pathname: string,
): Promise<Response | undefined> | undefined {
  if (publicPaths.has(pathname)) {
    return readAsset(join(clientDir, pathname), 'public, max-age=3600');
  }

  const path = join(clientDir, pathname);

  if (!pathname.startsWith('/assets/') || !path.startsWith(join(clientDir, 'assets') + sep)) {
    return undefined;
  }

  return readAsset(path, 'public, max-age=31536000, immutable');
}

async function readAsset(path: string, cacheControl: string): Promise<Response | undefined> {
  const file = Bun.file(path);

  const exists = await file.exists();

  return exists ? new Response(file, { headers: { 'cache-control': cacheControl } }) : undefined;
}

// A rendered page holds the conversation of the session that asked for it, so no cache between the
// browser and the web server may keep it or serve it to another browser.
function toPrivateResponse(response: Response): Response {
  const headers = new Headers(response.headers);

  headers.set('cache-control', 'private, no-store');
  headers.append('vary', 'cookie');

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
