import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { buildCallCost } from '@heynixie/models';
import type { ModelAPIEndpointName, ModelCallUsage } from '@heynixie/wire';
import {
  captureAnswerSchema,
  capturePath,
  decodeCaptureTag,
  parseJSONOrNull,
} from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildCallTokens } from './build-call-tokens';
import { buildCountedStream } from './build-counted-stream';
import type { CaptureSpool } from './create-capture-spool';
import { findProxyEndpoint } from './find-proxy-endpoint';
import { isRecord } from './is-record';
import type { CounterStore, ProxyLimits, ProxyRoute, SpendTotals, StoredCount } from './types';
import { usageDialects } from './usage-dialects';

export interface ProxyHandlerDeps {
  readonly routes: Readonly<Record<string, ProxyRoute>>;
  readonly limits: ProxyLimits;
  readonly store: CounterStore;

  // null when the config holds no capture key
  readonly capture: CaptureSpool | null;
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
    usage: ModelCallUsage | null,
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
    const receivedAt = Date.now();

    const url = new URL(request.url);

    // no route ID can match this path, and the answer is about the capture, not the spend
    if (url.pathname === capturePath) {
      return answerCaptureAsk(deps.capture, request, url);
    }

    const target = findRouteTarget(deps.routes, url.pathname);

    if (target === null) {
      return renderAPIError(
        404,
        'not_found_error',
        `the model gateway has no route for ${url.pathname}`,
      );
    }

    const endpoint = findProxyEndpoint(target.route.api, request.method, target.path);

    if (endpoint === null) {
      return renderAPIError(
        403,
        'permission_error',
        `the model gateway forwards only requests whose spend it can count, so it refuses ${request.method} ${target.rawPath}`,
      );
    }

    const totals = await readTotals(deps);

    if (totals === null) {
      return renderAPIError(
        503,
        'api_error',
        'the model gateway cannot read its counter store, so it refuses every request',
      );
    }

    if (countFailed || totals.lost) {
      return renderAPIError(
        503,
        'api_error',
        'the model gateway lost the count of a reply, so it refuses every request until an operator clears the mark in its counter store',
      );
    }

    if (isLimitReached(totals, deps.limits)) {
      return renderAPIError(403, 'permission_error', formatLimitRefusal(totals, deps.limits));
    }

    const rule = endpoint.body;
    const body = rule === null ? null : await request.arrayBuffer();

    const parsed =
      rule === null || body === null
        ? null
        : rule.schema.safeParse(parseJSONOrNull(new TextDecoder().decode(body)));

    if (parsed?.success === false) {
      invariant(rule !== null, 'only an endpoint with a body rule parses a body');

      return renderAPIError(
        400,
        'invalid_request_error',
        `the model gateway needs a JSON body that ${rule.needs} for ${endpoint.name}`,
      );
    }

    if (parsed !== null && parsed.data.model !== target.route.model) {
      return renderAPIError(
        400,
        'invalid_request_error',
        `the model gateway prices this route for ${target.route.model}, so it refuses a request for ${parsed.data.model}`,
      );
    }

    const tag =
      deps.capture !== null &&
      target.tag !== null &&
      body !== null &&
      isCapturableEndpoint(endpoint.name)
        ? decodeCaptureTag(target.tag)
        : null;

    const handle =
      deps.capture === null || tag === null || body === null || !isCapturableEndpoint(endpoint.name)
        ? null
        : deps.capture.begin({
            tag,
            receivedAt,
            route: target.routeID,
            api: target.route.api,
            endpoint: endpoint.name,
            body: new Uint8Array(body),
          });

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

    if (upstream === null) {
      handle?.drop();
    } else {
      handle?.finish(upstream.status);
    }

    // a connection can break after the model API took the call, so the model may have spent
    if (upstream === null) {
      if (endpoint.spends) {
        await loseCount();
      }

      return renderAPIError(502, 'api_error', 'the model gateway could not reach the model API');
    }

    const init = {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildDownstreamHeaders(upstream.headers),
    };

    // a successful message reply has spent, and an error reply has not
    const spent = endpoint.spends && upstream.ok;
    const dialect = usageDialects[target.route.api];

    if (upstream.body === null) {
      await count(target.route, null, spent);

      return new Response(null, init);
    }

    // a stream that broke or was cancelled before its first usage event may still have spent
    if (upstream.headers.get('content-type')?.startsWith('text/event-stream') === true) {
      return new Response(
        buildCountedStream(upstream.body, dialect, (usage, complete) =>
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

      return renderAPIError(502, 'api_error', 'the model gateway lost the reply of the model API');
    }

    await count(target.route, dialect.parseUsage(findBodyUsage(text)), spent);

    return new Response(text, init);
  };
}

function isLimitReached(totals: SpendTotals, limits: ProxyLimits): boolean {
  return (
    (limits.dollars !== null && totals.dollars >= limits.dollars) ||
    (limits.tokens !== null && totals.tokens >= limits.tokens)
  );
}

async function answerCaptureAsk(
  capture: CaptureSpool | null,
  request: Request,
  url: URL,
): Promise<Response> {
  if (request.method !== 'GET') {
    return renderAPIError(
      405,
      'invalid_request_error',
      `the model gateway answers ${capturePath} only to GET, so it refuses ${request.method}`,
    );
  }

  const spool = url.searchParams.get('spool');

  if (spool === null || spool === '') {
    return renderAPIError(
      400,
      'invalid_request_error',
      `the model gateway needs a spool query for ${capturePath}`,
    );
  }

  const canCapture = capture === null ? false : await capture.probeCapture(spool);

  return Response.json(captureAnswerSchema.parse({ canCapture }));
}

function renderAPIError(status: number, type: string, message: string): Response {
  return Response.json({ type: 'error', error: { type, message } }, { status });
}

interface RouteTarget {
  readonly routeID: string;
  readonly route: ProxyRoute;

  // the path after the route, with a capture tag removed
  readonly path: string;

  // the path after the route, as the request sent it
  readonly rawPath: string;

  // the tag segment after `~in.`, or null when the path has none
  readonly tag: string | null;
}

const captureTagPrefix = '~in.';

function findRouteTarget(
  routes: Readonly<Record<string, ProxyRoute>>,
  pathname: string,
): RouteTarget | null {
  const [, routeID = '', ...rest] = pathname.split('/');
  const route = Object.hasOwn(routes, routeID) ? routes[routeID] : undefined;

  if (route === undefined) {
    return null;
  }

  const first = rest[0] ?? '';
  const isTagged = first.startsWith(captureTagPrefix);
  const kept = isTagged ? rest.slice(1) : rest;

  return {
    routeID,
    route,
    path: kept.length === 0 ? '' : `/${kept.join('/')}`,
    rawPath: rest.length === 0 ? '' : `/${rest.join('/')}`,
    tag: isTagged ? first.slice(captureTagPrefix.length) : null,
  };
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

  return `the model gateway reached its spending limit (${spent.join(', ')}), so it refuses every further request`;
}

function isCapturableEndpoint(name: ModelAPIEndpointName): name is 'messages' | 'responses' {
  return name === 'messages' || name === 'responses';
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
