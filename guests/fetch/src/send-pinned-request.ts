import type { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import type { LookupFunction } from 'node:net';
import { isIP } from 'node:net';
import { toBareHost } from './to-bare-host';

export interface PinnedTarget {
  readonly url: URL;

  readonly address: string;
}

export interface PinnedRequestOptions {
  readonly signal: AbortSignal;
  readonly ca?: string;
}

const userAgent = 'Mozilla/5.0 (compatible; nixie-fetch/1.0)';

export function sendPinnedRequest(
  target: PinnedTarget,
  options: PinnedRequestOptions,
): Promise<IncomingMessage> {
  const host = toBareHost(target.url.hostname);
  const response = Promise.withResolvers<IncomingMessage>();

  const outgoing = request(
    {
      host,
      port: target.url.port === '' ? 443 : Number(target.url.port),
      path: `${target.url.pathname}${target.url.search}`,
      method: 'GET',

      // TLS forbids an IP address in SNI (RFC 6066).
      ...(isIP(host) === 0 ? { servername: host } : {}),
      lookup: makePinnedLookup(target.address),

      // A proxy would resolve the host itself, and an empty proxyEnv stops the runtime from reading
      // one from the environment.
      agent: new Agent({ keepAlive: false, proxyEnv: {} }),
      ...(options.ca === undefined ? {} : { ca: options.ca }),
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
      },
      signal: options.signal,
    },
    response.resolve,
  );

  outgoing.on('error', response.reject);
  outgoing.end();

  return response.promise;
}

function makePinnedLookup(address: string): LookupFunction {
  const family = isIP(address);

  return (_hostname, lookupOptions, answer) => {
    if (lookupOptions.all === true) {
      answer(null, [{ address, family }]);
    } else {
      answer(null, address, family);
    }
  };
}
