import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { CallUsage } from '@heynixie/models';
import { buildCallCost } from '@heynixie/models';
import { parseJSONOrNull } from '@heynixie/wire';
import { buildCallTokens } from './build-call-tokens';
import { buildCountedStream } from './build-counted-stream';
import { findProxyEndpoint } from './find-proxy-endpoint';
import { isRecord } from './is-record';
import { parseReportedUsage } from './parse-reported-usage';
import type { CounterStore, ProxyLimits, ProxyRoute, SpendTotals, StoredCount } from './types';

export interface ProxyHandlerDeps {
  readonly routes: Readonly<Record<string, ProxyRoute>>;
  readonly limits: ProxyLimits;
  readonly store: CounterStore;
  readonly sendUpstream: (url: string, init: RequestInit) => Promise<Response>;
  readonly log: Logger;
}

export function makeProxyHandler(deps: ProxyHandlerDeps): (request: Request) => Promise<Response> {
  // a count that failed to write, or a reply lost before its usage arrived, leaves the store behind
  // the spend, so the store keeps a mark that refuses every later request, across a restart, until
  // an operator clears it; the latch refuses in this process when the mark cannot be written
  let countFailed = false;
  let limitLogged = false;

  const loseCount = async (): Promise<void> => {
    countFailed = true;

    await deps.store.markLost().catch((error: unknown) => {
      deps.log('counter.mark_failed', toErrorFields(error), 'error');
    });
  };

  // required marks a reply that spent for certain, or may have, so one with no usage the proxy
  // can read leaves the count behind
  const count = async (
    route: ProxyRoute,
    usage: CallUsage | null,
    required: boolean,
  ): Promise<void> => {
    if (usage === null && required) {
      deps.log('count.lost', {}, 'error');

      await loseCount();

      return;
    }

    if (usage === null) {
      return;
    }

    try {
      const totals = await deps.store.add({
        dollars: buildCallCost(usage, route.prices),
        tokens: buildCallTokens(usage),
      });

      if (!limitLogged && isLimitReached(totals, deps.limits)) {
        limitLogged = true;

        deps.log('limit.reached', { ...totals }, 'warn');
      }
    } catch (error) {
      deps.log('counter.write_failed', toErrorFields(error), 'error');

      await loseCount();
    }
  };

  return async (request) => {
    const url = new URL(request.url);

    const target = findRouteTarget(deps.routes, url.pathname);

    if (target === null) {
      return renderAPIError(
        404,
        'not_found_error',
        `the counting proxy has no route for ${url.pathname}`,
      );
    }

    const endpoint = findProxyEndpoint(request.method, target.path);

    if (endpoint === null) {
      return renderAPIError(
        403,
        'permission_error',
        `the counting proxy forwards only requests whose spend it can count, so it refuses ${request.method} ${target.path}`,
      );
    }

    const totals = await readTotals(deps);

    if (totals === null) {
      return renderAPIError(
        503,
        'api_error',
        'the counting proxy cannot read its counter store, so it refuses every request',
      );
    }

    if (countFailed || totals.lost) {
      return renderAPIError(
        503,
        'api_error',
        'the counting proxy lost the count of a reply, so it refuses every request until an operator clears the mark in its counter store',
      );
    }

    if (isLimitReached(totals, deps.limits)) {
      return renderAPIError(403, 'permission_error', formatLimitRefusal(totals, deps.limits));
    }

    const body = endpoint.body === null ? null : await request.arrayBuffer();

    const parsed =
      endpoint.body === null || body === null
        ? null
        : endpoint.body.safeParse(parseJSONOrNull(new TextDecoder().decode(body)));

    if (parsed?.success === false) {
      return renderAPIError(
        400,
        'invalid_request_error',
        `the counting proxy needs a JSON body that names its model for ${endpoint.name}`,
      );
    }

    if (parsed !== null && parsed.data.model !== target.route.model) {
      return renderAPIError(
        400,
        'invalid_request_error',
        `the counting proxy prices this route for ${target.route.model}, so it refuses a request for ${parsed.data.model}`,
      );
    }

    const upstream = await deps
      .sendUpstream(`${target.route.upstream}${target.path}${url.search}`, {
        method: request.method,
        headers: buildUpstreamHeaders(request.headers),
        body,
        redirect: 'manual',
      })
      .catch((error: unknown) => {
        deps.log('upstream.failed', toErrorFields(error), 'error');

        return null;
      });

    // a connection can break after the model API took the call, so the model may have spent
    if (upstream === null) {
      if (endpoint.spends) {
        await loseCount();
      }

      return renderAPIError(502, 'api_error', 'the counting proxy could not reach the model API');
    }

    const init = {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildDownstreamHeaders(upstream.headers),
    };

    // a successful message reply has spent, and an error reply has not
    const spent = endpoint.spends && upstream.ok;

    if (upstream.body === null) {
      await count(target.route, null, spent);

      return new Response(null, init);
    }

    // a stream that broke or was cancelled before its first usage event may still have spent
    if (upstream.headers.get('content-type')?.startsWith('text/event-stream') === true) {
      return new Response(
        buildCountedStream(upstream.body, (usage, complete) =>
          count(target.route, usage, spent || !complete),
        ),
        init,
      );
    }

    const text = await upstream.text().catch((error: unknown) => {
      deps.log('upstream.body_failed', toErrorFields(error), 'error');

      return null;
    });

    // the model may have spent on a reply whose usage never arrived, so the count is behind
    if (text === null) {
      if (endpoint.spends) {
        await loseCount();
      }

      return renderAPIError(502, 'api_error', 'the counting proxy lost the reply of the model API');
    }

    await count(target.route, parseReportedUsage(findBodyUsage(text)), spent);

    return new Response(text, init);
  };
}

function isLimitReached(totals: SpendTotals, limits: ProxyLimits): boolean {
  return (
    (limits.dollars !== null && totals.dollars >= limits.dollars) ||
    (limits.tokens !== null && totals.tokens >= limits.tokens)
  );
}

function findRouteTarget(
  routes: Readonly<Record<string, ProxyRoute>>,
  pathname: string,
): { readonly route: ProxyRoute; readonly path: string } | null {
  const [, routeID = '', ...rest] = pathname.split('/');
  const route = Object.hasOwn(routes, routeID) ? routes[routeID] : undefined;

  return route === undefined
    ? null
    : { route, path: rest.length === 0 ? '' : `/${rest.join('/')}` };
}

function renderAPIError(status: number, type: string, message: string): Response {
  return Response.json({ type: 'error', error: { type, message } }, { status });
}

async function readTotals(deps: ProxyHandlerDeps): Promise<StoredCount | null> {
  try {
    return await deps.store.read();
  } catch (error) {
    deps.log('counter.read_failed', toErrorFields(error), 'error');

    return null;
  }
}

function formatLimitRefusal(totals: SpendTotals, limits: ProxyLimits): string {
  const spent = [
    limits.dollars === null ? null : `$${totals.dollars.toFixed(4)} of $${String(limits.dollars)}`,
    limits.tokens === null ? null : `${String(totals.tokens)} of ${String(limits.tokens)} tokens`,
  ].filter((part) => part !== null);

  return `the counting proxy reached its spending limit (${spent.join(', ')}), so it refuses every further request`;
}

// hop-by-hop headers, and the ones the proxy sets again for the body it sends on
const REQUEST_HEADERS_DROPPED = [
  'host',
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
];

function buildUpstreamHeaders(received: Headers): Headers {
  const headers = new Headers(received);

  for (const name of REQUEST_HEADERS_DROPPED) {
    headers.delete(name);
  }

  // an uncompressed reply lets the proxy read the usage as it passes
  headers.set('accept-encoding', 'identity');

  return headers;
}

const RESPONSE_HEADERS_DROPPED = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
];

function buildDownstreamHeaders(received: Headers): Headers {
  const headers = new Headers(received);

  for (const name of RESPONSE_HEADERS_DROPPED) {
    headers.delete(name);
  }

  return headers;
}

function findBodyUsage(text: string): unknown {
  const parsed = parseJSONOrNull(text);

  return isRecord(parsed) ? parsed['usage'] : null;
}
