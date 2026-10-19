import type { FetchLimits, FetchReply } from '@heynixie/wire';
import type { AddressCheck } from './make-address-check';
import { planHop } from './plan-hop';
import { readResponsePage } from './read-response-page';
import { sendPinnedRequest } from './send-pinned-request';

export interface PageReaderOptions {
  readonly limits: FetchLimits;
  readonly checkAddress: AddressCheck;

  // every A and AAAA address of a host name
  readonly resolveHost: (host: string) => Promise<readonly string[]>;

  // the roots the reader trusts in place of the system's, which only a test passes
  readonly ca?: string;
}

// Reads one public HTTPS page within the limits. Each hop, the first and every redirect, passes
// the scheme and address checks before it connects; a failure past them returns failed, and a
// fetch that outlives the time limit fails as a whole.
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
    const step = await readHop(hop.url, { ...options, signal });

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

const redirectStatuses: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

// one hop: the checks, then the request to the checked address, then the page or the redirect
async function readHop(
  url: string,
  options: PageReaderOptions & { readonly signal: AbortSignal },
): Promise<FetchReply | { readonly kind: 'redirect'; readonly location: string }> {
  const planned = await planHop(url, options);

  if (planned.kind === 'refused') {
    return planned;
  }

  const response = await sendPinnedRequest(planned, options);

  const location = response.headers.location;

  if (!redirectStatuses.has(response.statusCode ?? 0) || location === undefined) {
    return readResponsePage(planned.url, response, options.limits);
  }

  response.destroy();

  return { kind: 'redirect', location: new URL(location, planned.url).href };
}
