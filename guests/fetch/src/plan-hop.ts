import { isIP } from 'node:net';
import type { AddressCheck } from './make-address-check';
import { toBareHost } from './to-bare-host';

export interface HopOptions {
  readonly checkAddress: AddressCheck;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly signal: AbortSignal;
}

export type PlannedHop =
  | { readonly kind: 'connect'; readonly url: URL; readonly address: string }
  | { readonly kind: 'refused'; readonly reason: string };

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
