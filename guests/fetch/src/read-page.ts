import type { IncomingMessage } from 'node:http';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import type { WebTransports } from './create-web-transports';
import type { AddressCheck } from './make-address-check';
import { planHop } from './plan-hop';
import { readResponsePage } from './read-response-page';
import type { DefaultPorts, PinnedRequestOptions } from './send-pinned-request';
import { sendPinnedRequest } from './send-pinned-request';

export interface PageReaderOptions {
  readonly limits: FetchLimits;
  readonly checkAddress: AddressCheck;

  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly transports: WebTransports;

  readonly ca?: string;
  readonly defaultPorts?: DefaultPorts;
}

export async function readPage(url: string, options: PageReaderOptions): Promise<FetchReply> {
  const signal = AbortSignal.timeout(options.limits.timeoutMs);

  try {
    return await readRedirectChain(url, options, signal);
  } catch (error) {
    if (signal.aborted) {
      return { kind: 'failed', reason: `the fetch passed ${options.limits.timeoutMs} ms` };
    }

    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

async function readRedirectChain(
  url: string,
  options: PageReaderOptions,
  signal: AbortSignal,
): Promise<FetchReply> {
  const hop = { url, count: 0 };

  for (;;) {
    const mayTryHTTPS = hop.count === 0 && !hasExplicitPort(hop.url);

    const step = await readHop(hop.url, mayTryHTTPS, { ...options, signal });

    if (step.kind !== 'redirect') {
      return step;
    }

    if (hop.count === options.limits.redirects) {
      return { kind: 'failed', reason: `the page redirected more than ${hop.count} times` };
    }

    hop.url = step.location;
    hop.count += 1;
  }
}

// URL parsing drops a port that is the scheme's default, so an explicit :80 shows only in the text.
function hasExplicitPort(text: string): boolean {
  const authority =
    /^\s*[a-z][\w+.-]*:[/\\]*(?<authority>[^/\\?#]*)/iu.exec(text)?.groups?.['authority'] ?? '';

  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1).replace(/^\[[^\]]*\]/u, '');

  return /:\d+$/u.test(hostAndPort);
}

const redirectStatuses: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

async function readHop(
  url: string,
  mayTryHTTPS: boolean,
  options: PageReaderOptions & { readonly signal: AbortSignal },
): Promise<FetchReply | { readonly kind: 'redirect'; readonly location: string }> {
  const planned = await planHop(url, options);

  if (planned.kind === 'refused') {
    return planned;
  }

  const attempt = pickHopAttempt(planned.url, mayTryHTTPS, options.limits.timeoutMs);

  const answered = await sendHopAttempt(attempt, planned.address, options);

  const location = answered.response.headers.location;

  if (!redirectStatuses.has(answered.response.statusCode ?? 0) || location === undefined) {
    return readResponsePage(answered.url, answered.response, options.limits);
  }

  answered.response.destroy();

  return { kind: 'redirect', location: new URL(location, answered.url).href };
}

type HopAttempt =
  | { readonly kind: 'direct'; readonly url: URL }
  | {
      readonly kind: 'https-first';
      readonly url: URL;
      readonly connectTimeoutMs: number;
      readonly fallbackURL: URL;
    };

// A host that drops packets to port 443 never refuses the https try, so the try gets this share of
// the time limit to open its connection, and the http fallback keeps the rest.
const httpsTryConnectShare = 0.2;

// A redirect to http is followed as sent: a site that sends https to http would loop if its
// redirect were tried over https again.
function pickHopAttempt(url: URL, mayTryHTTPS: boolean, timeoutMs: number): HopAttempt {
  if (!mayTryHTTPS || url.protocol !== 'http:') {
    return { kind: 'direct', url };
  }

  const httpsURL = new URL(url);

  httpsURL.protocol = 'https:';

  return {
    kind: 'https-first',
    url: httpsURL,
    connectTimeoutMs: Math.round(timeoutMs * httpsTryConnectShare),
    fallbackURL: url,
  };
}

async function sendHopAttempt(
  attempt: HopAttempt,
  address: string,
  options: PinnedRequestOptions,
): Promise<{ readonly url: URL; readonly response: IncomingMessage }> {
  if (attempt.kind === 'direct') {
    return {
      url: attempt.url,
      response: await sendPinnedRequest({ url: attempt.url, address }, options),
    };
  }

  try {
    return {
      url: attempt.url,
      response: await sendPinnedRequest(
        { url: attempt.url, address },
        { ...options, connectTimeoutMs: attempt.connectTimeoutMs },
      ),
    };
  } catch (error) {
    if (options.signal.aborted) {
      throw error;
    }

    return {
      url: attempt.fallbackURL,
      response: await sendPinnedRequest({ url: attempt.fallbackURL, address }, options),
    };
  }
}
