import type { ConnectorContext } from '@heynixie/connections';
import { readRetryAfterMs } from '@heynixie/tools';
import { parseJSONOrNull } from '@heynixie/wire';
import type { GoogleHosts } from '../types';
import { readGoogleError } from './read-google-error';

export type GoogleCall =
  | {
      readonly kind: 'ok';
      readonly status: number;

      // the JSON the call answered with; an empty object for an empty answer, and null for an
      // answer that is no JSON or does not parse
      readonly body: unknown;
      readonly bytes: Uint8Array;
      readonly type: string;
    }
  | {
      readonly kind: 'error';
      readonly status: number;
      readonly reason: string;

      // Google's own quota answer: 429, or 403 with a rate-limit reason
      readonly isRateLimit: boolean;
      readonly retryAfterMs: number | null;
    };

export interface GoogleRequest {
  // after the origin of Google's APIs, such as `/calendar/v3/calendars/primary/events`
  readonly path: string;
  readonly query?: Readonly<Record<string, string | readonly string[]>>;
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly headers?: Readonly<Record<string, string>>;
  readonly json?: unknown;

  // a body that is no JSON, such as a multipart upload
  readonly raw?: { readonly type: string; readonly body: string };
}

// One call to Google's Calendar or Drive API through the connection's fetcher, which adds the
// credential on the host. A network failure throws, so a queued attempt counts it as an ambiguity.
export async function callGoogle(
  hosts: GoogleHosts,
  context: ConnectorContext,
  request: GoogleRequest,
): Promise<GoogleCall> {
  const url = new URL(`${hosts.apisOrigin}${request.path}`);

  for (const [name, value] of Object.entries(request.query ?? {})) {
    for (const item of typeof value === 'string' ? [value] : value) {
      url.searchParams.append(name, item);
    }
  }

  const response = await context.fetch(url.href, {
    method: request.method ?? 'GET',
    headers: {
      ...(request.json === undefined ? {} : { 'content-type': 'application/json' }),
      ...(request.raw === undefined ? {} : { 'content-type': request.raw.type }),
      ...request.headers,
    },
    ...(request.json === undefined ? {} : { body: JSON.stringify(request.json) }),
    ...(request.raw === undefined ? {} : { body: request.raw.body }),
  });

  const buffer = await response.arrayBuffer();

  const bytes = new Uint8Array(buffer);

  const type = response.headers.get('content-type') ?? '';

  if (response.ok) {
    return {
      kind: 'ok',
      status: response.status,
      body: readBody(bytes, type),
      bytes,
      type,
    };
  }

  const text = new TextDecoder().decode(bytes);

  const error = readGoogleError(text, response.status, 'Google');

  return {
    kind: 'error',
    status: response.status,
    reason: error.reason,
    isRateLimit: error.isRateLimit,
    retryAfterMs: readRetryAfterMs(response.headers),
  };
}

function readBody(bytes: Uint8Array, type: string): unknown {
  if (bytes.length === 0) {
    return {};
  }

  return type.includes('json') ? parseJSONOrNull(new TextDecoder().decode(bytes)) : null;
}
