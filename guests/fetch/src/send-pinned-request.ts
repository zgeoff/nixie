import type { ClientRequest, IncomingMessage } from 'node:http';
import { Agent as HTTPAgent, request as requestHTTP } from 'node:http';
import { Agent as HTTPSAgent, request as requestHTTPS } from 'node:https';
import type { LookupFunction } from 'node:net';
import { isIP } from 'node:net';
import { toBareHost } from './to-bare-host';

export interface PinnedTarget {
  readonly url: URL;

  readonly address: string;
}

export interface DefaultPorts {
  readonly http: number;
  readonly https: number;
}

export interface PinnedRequestOptions {
  readonly signal: AbortSignal;
  readonly ca?: string;
  readonly defaultPorts?: DefaultPorts;
  readonly connectTimeoutMs?: number;
}

const userAgent = 'Mozilla/5.0 (compatible; nixie-fetch/1.0)';
const webDefaultPorts: DefaultPorts = { http: 80, https: 443 };

export function sendPinnedRequest(
  target: PinnedTarget,
  options: PinnedRequestOptions,
): Promise<IncomingMessage> {
  const host = toBareHost(target.url.hostname);
  const response = Promise.withResolvers<IncomingMessage>();
  const isHTTPS = target.url.protocol === 'https:';
  const defaultPorts = options.defaultPorts ?? webDefaultPorts;

  const shared = {
    host,
    port:
      target.url.port === '' ? defaultPorts[isHTTPS ? 'https' : 'http'] : Number(target.url.port),
    path: `${target.url.pathname}${target.url.search}`,
    method: 'GET',
    lookup: makePinnedLookup(target.address),
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'accept-encoding': 'gzip, deflate, br',
    },
    signal: options.signal,
  };

  // A proxy would resolve the host itself, and an empty proxyEnv stops the runtime from reading
  // one from the environment.
  const outgoing = isHTTPS
    ? requestHTTPS(
        {
          ...shared,

          // TLS forbids an IP address in SNI (RFC 6066).
          ...(isIP(host) === 0 ? { servername: host } : {}),
          agent: new HTTPSAgent({ keepAlive: false, proxyEnv: {} }),
          ...(options.ca === undefined ? {} : { ca: options.ca }),
        },
        response.resolve,
      )
    : requestHTTP(
        { ...shared, agent: new HTTPAgent({ keepAlive: false, proxyEnv: {} }) },
        response.resolve,
      );

  outgoing.on('error', response.reject);

  const openEvent = isHTTPS ? 'secureConnect' : 'connect';

  if (options.connectTimeoutMs !== undefined) {
    limitConnectTime(outgoing, openEvent, options.connectTimeoutMs);
  }

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

function limitConnectTime(
  outgoing: ClientRequest,
  openEvent: 'connect' | 'secureConnect',
  timeoutMs: number,
): void {
  const timer = setTimeout(() => {
    outgoing.destroy(new Error(`the connection did not open within ${timeoutMs} ms`));
  }, timeoutMs);

  outgoing.once('socket', (socket) => {
    socket.once(openEvent, () => {
      clearTimeout(timer);
    });
  });

  outgoing.once('close', () => {
    clearTimeout(timer);
  });
}
