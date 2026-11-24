import { isIP } from 'node:net';
import type { AddressCheck } from '@heynixie/egress';
import { pickConnectAddress, toBareHost } from '@heynixie/egress';

export interface HopOptions {
  readonly checkAddress: AddressCheck;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly signal: AbortSignal;
}

export type PlannedHop =
  | { readonly kind: 'connect'; readonly url: URL; readonly address: string }
  | { readonly kind: 'refused'; readonly reason: string };

export async function planHop(text: string, options: HopOptions): Promise<PlannedHop> {
  const url = parseWebURL(text);

  if (!(url instanceof URL)) {
    return url;
  }

  const host = toBareHost(url.hostname);
  const addresses = isIP(host) === 0 ? await resolveOrAbort(host, options) : [host];
  const picked = pickConnectAddress(host, addresses, options.checkAddress);

  return picked.kind === 'connect' ? { kind: 'connect', url, address: picked.address } : picked;
}

const webProtocols: ReadonlySet<string> = new Set(['http:', 'https:']);

function parseWebURL(text: string): URL | Extract<PlannedHop, { kind: 'refused' }> {
  if (!URL.canParse(text)) {
    return { kind: 'refused', reason: `${text} is not a URL` };
  }

  const url = new URL(text);

  if (!webProtocols.has(url.protocol)) {
    return { kind: 'refused', reason: `only http and https URLs are fetched, not ${url.protocol}` };
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
