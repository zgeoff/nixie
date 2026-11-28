import type { ConnectorContext } from '@heynixie/connections';
import { readRetryAfterMs } from '@heynixie/tools';
import { parseJSONOrNull } from '@heynixie/wire';
import { readGoogleError } from '../call/read-google-error';
import type { GoogleHosts } from '../types';

export type GmailCall =
  | {
      readonly kind: 'ok';

      // null for an answer that does not parse
      readonly body: unknown;
    }
  | {
      readonly kind: 'error';
      readonly status: number;
      readonly reason: string;

      // Gmail's own quota answer: 429, or 403 with a rate-limit reason
      readonly isRateLimit: boolean;
      readonly retryAfterMs: number | null;
    };

export interface GmailRequest {
  // after `/gmail/v1/users/me`, such as `/messages`
  readonly path: string;
  readonly query?: Readonly<Record<string, string | readonly string[]>>;

  // the `q` search of Gmail
  readonly search?: string;
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly json?: unknown;
}

// One call to Gmail through the connection's fetcher, which adds the credential on the host. A
// network failure throws, so a queued attempt counts it as an ambiguity.
export async function callGmail(
  hosts: GoogleHosts,
  context: ConnectorContext,
  request: GmailRequest,
): Promise<GmailCall> {
  const url = new URL(`${hosts.gmailOrigin}/gmail/v1/users/me${request.path}`);

  if (request.search !== undefined) {
    url.searchParams.append('q', request.search);
  }

  for (const [name, value] of Object.entries(request.query ?? {})) {
    for (const item of typeof value === 'string' ? [value] : value) {
      url.searchParams.append(name, item);
    }
  }

  const response = await context.fetch(url.href, {
    method: request.method ?? 'GET',
    ...(request.json === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.json) }),
  });

  const text = await response.text();

  if (response.ok) {
    return { kind: 'ok', body: text === '' ? {} : parseJSONOrNull(text) };
  }

  const error = readGoogleError(text, response.status, 'Gmail');

  return {
    kind: 'error',
    status: response.status,
    reason: error.reason,
    isRateLimit: error.isRateLimit,
    retryAfterMs: readRetryAfterMs(response.headers),
  };
}
