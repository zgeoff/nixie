import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { ModelAPIEndpointName } from '@heynixie/wire';
import {
  captureAnswerSchema,
  capturePath,
  decodeCaptureTag,
  parseJSONOrNull,
} from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { CounterStore, ProxyLimits, ProxyRoute } from '../types';
import { buildCountedStream } from '../usage/build-counted-stream';
import type { CaptureSpool } from '../usage/create-capture-spool';
import { usageDialects } from '../usage/usage-dialects';
import { isRecord } from '../utils/is-record';
import { findBodyRefusal } from './find-body-refusal';
import { findHeaderRefusal } from './find-header-refusal';
import { findProxyEndpoint } from './find-proxy-endpoint';
import { hasDuplicateKey } from './has-duplicate-key';
import { makeLimitsAccounting } from './make-limits-accounting';
import type { PeriodsAccountingDeps } from './make-periods-accounting';
import { makePeriodsAccounting } from './make-periods-accounting';
import { renderAPIError } from './render-api-error';

interface ProxyHandlerBaseDeps {
  readonly routes: Readonly<Record<string, ProxyRoute>>;

  // null when the config holds no capture key
  readonly capture: CaptureSpool | null;
  readonly sendUpstream: (url: string, init: RequestInit) => Promise<Response>;
  readonly log: Logger;
}

// a config with limits counts one total; a config with periods counts a day, a month and, with
// countBySandbox, each sandbox, which the first path segment names
export type ProxyHandlerDeps = ProxyHandlerBaseDeps &
  (
    | { readonly limits: ProxyLimits; readonly store: CounterStore }
    | { readonly periods: PeriodsAccountingDeps }
  );

export function makeProxyHandler(deps: ProxyHandlerDeps): (request: Request) => Promise<Response> {
  const accounting =
    'periods' in deps
      ? makePeriodsAccounting(deps.periods)
      : makeLimitsAccounting({ limits: deps.limits, store: deps.store, log: deps.log });

  const countBySandbox = 'periods' in deps && deps.periods.countBySandbox;

  return async (request) => {
    const receivedAt = Date.now();

    const url = new URL(request.url);

    // no route ID can match this path, and the answer is about the capture, not the spend
    if (url.pathname === capturePath) {
      return answerCaptureAsk(deps.capture, request, url);
    }

    const target = findRouteTarget(deps.routes, url.pathname, countBySandbox);

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

    const headerRefusal = findHeaderRefusal(request.headers);

    if (headerRefusal !== null) {
      return renderAPIError(400, 'invalid_request_error', headerRefusal);
    }

    const refusal = await accounting.admit(target.sandbox);

    if (refusal !== null) {
      return refusal;
    }

    const rule = endpoint.body;
    const body = rule === null ? null : await request.arrayBuffer();
    const bodyText = rule === null || body === null ? null : new TextDecoder().decode(body);

    const parsed =
      rule === null || bodyText === null ? null : rule.schema.safeParse(parseJSONOrNull(bodyText));

    if (parsed?.success === false) {
      invariant(rule !== null, 'only an endpoint with a body rule parses a body');

      return renderAPIError(
        400,
        'invalid_request_error',
        `the model gateway needs a JSON body that ${rule.needs} for ${endpoint.name}`,
      );
    }

    // the gateway forwards the raw bytes, so the model API must read the same value of each key
    if (parsed !== null && bodyText !== null && hasDuplicateKey(bodyText)) {
      return renderAPIError(
        400,
        'invalid_request_error',
        'the model gateway refuses a JSON body that names a key twice, because the model API could read the other value',
      );
    }

    if (parsed !== null && parsed.data.model !== target.route.model) {
      return renderAPIError(
        400,
        'invalid_request_error',
        `the model gateway prices this route for ${target.route.model}, so it refuses a request for ${parsed.data.model}`,
      );
    }

    const bodyRefusal = parsed === null ? null : findBodyRefusal(parsed.data, target.route);

    if (bodyRefusal !== null) {
      return renderAPIError(400, 'invalid_request_error', bodyRefusal);
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
        await accounting.loseCount();
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
      await accounting.count(target.route, target.sandbox, null, spent);

      return new Response(null, init);
    }

    // a stream that broke or was cancelled before its first usage event may still have spent
    if (upstream.headers.get('content-type')?.startsWith('text/event-stream') === true) {
      return new Response(
        buildCountedStream(upstream.body, dialect, (usage, complete) =>
          accounting.count(target.route, target.sandbox, usage, spent || !complete),
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
        await accounting.loseCount();
      }

      return renderAPIError(502, 'api_error', 'the model gateway lost the reply of the model API');
    }

    await accounting.count(
      target.route,
      target.sandbox,
      dialect.parseUsage(findBodyUsage(text)),
      spent,
    );

    return new Response(text, init);
  };
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

interface RouteTarget {
  // the sandbox segment before the route, or null when the gateway does not count by sandbox
  readonly sandbox: string | null;
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
  countBySandbox: boolean,
): RouteTarget | null {
  const [, first = '', ...afterFirst] = pathname.split('/');

  // with countBySandbox the path is /<sandbox>/<route>/[~in.<tag>/]<path>
  const sandbox = countBySandbox ? first : null;
  const [routeID = '', ...rest] = countBySandbox ? afterFirst : [first, ...afterFirst];
  const route = Object.hasOwn(routes, routeID) ? routes[routeID] : undefined;

  if (route === undefined) {
    return null;
  }

  const head = rest[0] ?? '';
  const isTagged = head.startsWith(captureTagPrefix);
  const kept = isTagged ? rest.slice(1) : rest;

  return {
    sandbox,
    routeID,
    route,
    path: kept.length === 0 ? '' : `/${kept.join('/')}`,
    rawPath: rest.length === 0 ? '' : `/${rest.join('/')}`,
    tag: isTagged ? head.slice(captureTagPrefix.length) : null,
  };
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
