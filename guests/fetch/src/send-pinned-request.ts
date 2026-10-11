import type { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import type { LookupFunction } from 'node:net';
import { isIP } from 'node:net';
import { toBareHost } from './to-bare-host';

export interface PinnedTarget {
  readonly url: URL;

  // the address the hop checked, which the connection goes to whatever DNS says later
  readonly address: string;
}

export interface PinnedRequestOptions {
  readonly signal: AbortSignal;
  readonly ca?: string;
}

// Sends a GET to the checked address, with the host name for TLS and in the Host header. It carries
// no credential, cookie or stored header, and never goes through a proxy, which would resolve the
// host itself: an empty proxyEnv stops the runtime from reading one from the environment.
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

      // SNI never carries an address
      ...(isIP(host) === 0 ? { servername: host } : {}),
      lookup: makePinnedLookup(target.address),
      agent: new Agent({ keepAlive: false, proxyEnv: {} }),
      ...(options.ca === undefined ? {} : { ca: options.ca }),
      headers: {
        'user-agent': 'nixie-fetch',
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

// a lookup that answers every host name with the one checked address
function makePinnedLookup(address: string): LookupFunction {
  const family = isIP(address);

  return (_hostname, lookupOptions, answer) => {
    if (lookupOptions.all === true) {
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- node's lookup contract is a callback
      answer(null, [{ address, family }]);
    } else {
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- node's lookup contract is a callback
      answer(null, address, family);
    }
  };
}
