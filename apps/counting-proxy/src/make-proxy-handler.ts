import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { CallUsage } from '@heynixie/models';
import { buildCallCost } from '@heynixie/models';
import { buildCallTokens } from './build-call-tokens';
import { buildCountedStream } from './build-counted-stream';
import { isRecord } from './is-record';
import { parseJSONOrNull } from './parse-json-or-null';
import { parseReportedUsage } from './parse-reported-usage';
import type { CounterStore, ProxyLimits, ProxyRoute, SpendTotals } from './types';

export interface ProxyHandlerDeps {
  readonly routes: Readonly<Record<string, ProxyRoute>>;
  readonly limits: ProxyLimits;
  readonly store: CounterStore;
  readonly log: Logger;
}

export function makeProxyHandler(deps: ProxyHandlerDeps): (request: Request) => Promise<Response> {
  // a count that failed to write leaves the store behind the spend, so every later request is
  // refused until the proxy restarts on a store it can read
  let countFailed = false;
  let limitLogged = false;

  const count = async (route: ProxyRoute, usage: CallUsage | null): Promise<void> => {
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
      countFailed = true;

      deps.log('counter.write_failed', toErrorFields(error), 'error');
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

    const totals = countFailed ? null : await readTotals(deps);

    if (totals === null) {
      return renderAPIError(
        503,
        'api_error',
        'the counting proxy cannot read its counter store, so it refuses every request',
      );
    }

    if (isLimitReached(totals, deps.limits)) {
      return renderAPIError(403, 'permission_error', formatLimitRefusal(totals, deps.limits));
    }

    const body = request.body === null ? null : await request.arrayBuffer();
    const model = findRequestModel(body);

    if (model !== null && model !== target.route.model) {
      return renderAPIError(
        400,
        'invalid_request_error',
        `the counting proxy prices this route for ${target.route.model}, so it refuses a request for ${model}`,
      );
    }

    const upstream = await fetch(`${target.route.upstream}${target.path}${url.search}`, {
      method: request.method,
      headers: buildUpstreamHeaders(request.headers),
      body,
      redirect: 'manual',
    }).catch((error: unknown) => {
      deps.log('upstream.failed', toErrorFields(error), 'error');

      return null;
    });

    if (upstream === null) {
      return renderAPIError(502, 'api_error', 'the counting proxy could not reach the model API');
    }

    const init = {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildDownstreamHeaders(upstream.headers),
    };

    if (upstream.body === null) {
      return new Response(null, init);
    }

    if (upstream.headers.get('content-type')?.startsWith('text/event-stream') === true) {
      return new Response(
        buildCountedStream(upstream.body, (usage) => count(target.route, usage)),
        init,
      );
    }

    const text = await upstream.text();

    await count(target.route, parseReportedUsage(findBodyUsage(text)));

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

async function readTotals(deps: ProxyHandlerDeps): Promise<SpendTotals | null> {
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

function findRequestModel(body: ArrayBuffer | null): string | null {
  const parsed = body === null ? null : parseJSONOrNull(new TextDecoder().decode(body));

  return isRecord(parsed) && typeof parsed['model'] === 'string' ? parsed['model'] : null;
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
