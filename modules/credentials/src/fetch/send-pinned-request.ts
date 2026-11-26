import type { IncomingMessage } from 'node:http';
import { request as requestHTTP } from 'node:http';
import { request as requestHTTPS } from 'node:https';
import { isIP } from 'node:net';
import { toBareHost } from '@heynixie/egress';
import { makePinnedLookup } from './make-pinned-lookup';
import { pickPinnedPort } from './pick-pinned-port';

export interface PinnedRequest {
  readonly url: URL;

  // the address the caller checked, which the connection uses and no lookup replaces
  readonly address: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array | null;
  readonly signal: AbortSignal;

  // a certificate authority a test site signs with
  readonly ca?: string;
}

export function sendPinnedRequest(pinned: PinnedRequest): Promise<IncomingMessage> {
  const host = toBareHost(pinned.url.hostname);
  const isHTTPS = pinned.url.protocol === 'https:';
  const response = Promise.withResolvers<IncomingMessage>();

  const options = {
    host,
    port: pickPinnedPort(pinned.url),
    path: `${pinned.url.pathname}${pinned.url.search}`,
    method: pinned.method,
    headers: pinned.headers,
    lookup: makePinnedLookup(pinned.address),
    signal: pinned.signal,
    agent: false,
  };

  const secure = {
    ...options,
    ...(isIP(host) === 0 ? { servername: host } : {}),
    ...(pinned.ca === undefined ? {} : { ca: pinned.ca }),
  };

  const outgoing = isHTTPS
    ? requestHTTPS(secure, response.resolve)
    : requestHTTP(options, response.resolve);

  const body = pinned.body === null ? undefined : Buffer.from(pinned.body);

  outgoing.on('error', response.reject);
  outgoing.end(body);

  return response.promise;
}
