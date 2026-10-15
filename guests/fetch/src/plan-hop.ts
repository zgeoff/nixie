// oxlint-disable typescript/prefer-readonly-parameter-types -- a URL has no readonly form
import { isIP } from 'node:net';
import type { AddressCheck } from './make-address-check';
import { toBareHost } from './to-bare-host';

export interface HopOptions {
  readonly checkAddress: AddressCheck;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly signal: AbortSignal;
}

// A URL the fetcher may connect to, with the checked address it connects to, or the refusal.
export type PlannedHop =
  | { readonly kind: 'connect'; readonly url: URL; readonly address: string }
  | { readonly kind: 'refused'; readonly reason: string };

// Plans one hop: it accepts https only, drops any user name, password and fragment, resolves the
// host, and refuses the URL when any A or AAAA address is not public.
export async function planHop(text: string, options: HopOptions): Promise<PlannedHop> {
  const url = parseHTTPSURL(text);

  if (!(url instanceof URL)) {
    return url;
  }

  const host = toBareHost(url.hostname);
  const addresses = isIP(host) === 0 ? await resolveOrAbort(host, options) : [host];

  return pickCheckedAddress(url, addresses, options.checkAddress);
}

function parseHTTPSURL(text: string): URL | Extract<PlannedHop, { kind: 'refused' }> {
  if (!URL.canParse(text)) {
    return { kind: 'refused', reason: `${text} is not a URL` };
  }

  const url = new URL(text);

  if (url.protocol !== 'https:') {
    return { kind: 'refused', reason: `only https URLs are fetched, not ${url.protocol}` };
  }

  url.username = '';
  url.password = '';
  url.hash = '';

  return url;
}

// the resolver's answer, or the time limit's abort when it comes first
async function resolveOrAbort(host: string, options: HopOptions): Promise<readonly string[]> {
  options.signal.throwIfAborted();

  const aborted = Promise.withResolvers<never>();

  const onAbort = () => {
    aborted.reject(options.signal.reason);
  };

  options.signal.addEventListener('abort', onAbort, { once: true });

  try {
    return await Promise.race([options.resolveHost(host), aborted.promise]);
  } finally {
    options.signal.removeEventListener('abort', onAbort);
  }
}

// the first address once every address passes the check; one failed address refuses the URL
function pickCheckedAddress(
  url: URL,
  addresses: readonly string[],
  checkAddress: AddressCheck,
): PlannedHop {
  const host = toBareHost(url.hostname);
  const refused = addresses.find((address) => !checkAddress(address));

  if (addresses[0] === undefined) {
    return { kind: 'refused', reason: `${host} resolves to no address` };
  }

  if (refused !== undefined) {
    return {
      kind: 'refused',
      reason: `${host} resolves to ${refused}, which is not a public address`,
    };
  }

  return { kind: 'connect', url, address: addresses[0] };
}
