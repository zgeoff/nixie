import type { ConnectorContext } from '@heynixie/connections';
import type { GoogleHosts } from '../types';

export type GmailCall =
  | { readonly kind: 'ok'; readonly body: unknown }
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
    return { kind: 'ok', body: text === '' ? {} : parseJSON(text) };
  }

  return {
    kind: 'error',
    status: response.status,
    reason: readReason(text, response.status),
    isRateLimit:
      response.status === 429 ||
      (response.status === 403 && /(?:user)?rateLimitExceeded/iu.test(text)),
    retryAfterMs: readRetryAfterMs(response.headers.get('retry-after')),
  };
}

function parseJSON(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return {};
  }
}

function readReason(text: string, status: number): string {
  const [first] = [...text.matchAll(/"reason"\s*:\s*"(?<reason>[^"]+)"/gu)].map(
    (match) => match.groups?.['reason'],
  );

  return first === undefined ? `Gmail answered ${String(status)}` : `Gmail answered ${first}`;
}

function readRetryAfterMs(header: string | null): number | null {
  const seconds = header === null ? Number.NaN : Number(header);

  return Number.isFinite(seconds) ? seconds * 1000 : null;
}
