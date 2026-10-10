import { join, sep } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { ORPCError, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

export interface WebFetchOptions {
  readonly apiURL: string;

  // The browser assets of the Vite build.
  readonly clientDir: string;
  readonly startFetch: (request: Request) => Promise<Response> | Response;
}

// Builds the web server's request handler: the server's own health endpoints, the browser assets
// of the build, and every other request through Start. /rpc never reaches the web server, because
// the reverse proxy sends it to nixie's API.
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

    const asset = await findAsset(options.clientDir, pathname);

    return asset ?? options.startFetch(request);
  };
}

// The probe calls the API with no session, so it holds no credential and grants nothing.
function buildProbeClient(apiURL: string): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({ headers: { [clientHeaderName]: 'web' }, url: `${apiURL}/rpc` }),
  );
}

// The web server is ready once it reaches nixie's API.
async function checkReadiness(probe: ContractClient): Promise<Response> {
  const reachable = await canReachAPI(probe);

  return reachable
    ? Response.json({ status: 'ready' })
    : Response.json({ status: 'unready', unready: ['api'] }, { status: 503 });
}

// The API answers a call with no session with its typed refusal, which shows it is up and speaks
// the contract. A dropped connection or any other answer leaves the web server unready.
async function canReachAPI(probe: ContractClient): Promise<boolean> {
  try {
    await probe.sessions.list(undefined, { signal: AbortSignal.timeout(2000) });

    return true;
  } catch (error) {
    return error instanceof ORPCError && error.code === 'UNAUTHORIZED';
  }
}

// Finds a built browser asset. The URL parser removes dot segments, and the prefix check refuses
// any path that still escapes the assets folder.
async function findAsset(clientDir: string, pathname: string): Promise<Response | undefined> {
  const path = join(clientDir, pathname);

  if (!pathname.startsWith('/assets/') || !path.startsWith(join(clientDir, 'assets') + sep)) {
    return undefined;
  }

  const file = Bun.file(path);
  const exists = await file.exists();

  return exists
    ? new Response(file, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
    : undefined;
}
