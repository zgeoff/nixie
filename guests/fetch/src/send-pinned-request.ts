import type { ClientRequest, IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
import { isIP } from 'node:net';
import { ConnectionNotOpenError } from './connection-not-open-error';
import type { WebTransports } from './create-web-transports';
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
  readonly transports: WebTransports;
  readonly signal: AbortSignal;
  readonly ca?: string;
  readonly defaultPorts?: DefaultPorts;
  readonly connectTimeoutMs?: number;
}

const userAgent = 'Mozilla/5.0 (compatible; nixie-fetch/1.0)';

const acceptHeader =
  'text/markdown, text/html;q=0.9, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.7';

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
      accept: acceptHeader,
      'accept-encoding': 'gzip, deflate, br',
    },
    signal: options.signal,
  };

  const outgoing = isHTTPS
    ? options.transports.https.request(
        {
          ...shared,

          // TLS forbids an IP address in SNI (RFC 6066).
          ...(isIP(host) === 0 ? { servername: host } : {}),
          agent: options.transports.https.agent,
          ...(options.ca === undefined ? {} : { ca: options.ca }),
        },
        response.resolve,
      )
    : options.transports.http.request(
        { ...shared, agent: options.transports.http.agent },
        response.resolve,
      );

  const openEvent = isHTTPS ? 'secureConnect' : 'connect';
  const connection = watchConnection(outgoing, openEvent, options.connectTimeoutMs);

  outgoing.on('error', (error) => {
    const failure = connection.isOpen() ? error : new ConnectionNotOpenError(error);

    response.reject(failure);
  });

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

function watchConnection(
  outgoing: ClientRequest,
  openEvent: 'connect' | 'secureConnect',
  connectTimeoutMs: number | undefined,
): { readonly isOpen: () => boolean } {
  const state = { isOpen: false };

  const timer =
    connectTimeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          outgoing.destroy(new Error(`the connection did not open within ${connectTimeoutMs} ms`));
        }, connectTimeoutMs);

  outgoing.once('socket', (socket) => {
    socket.once(openEvent, () => {
      state.isOpen = true;

      clearTimeout(timer);
    });
  });

  outgoing.once('close', () => {
    clearTimeout(timer);
  });

  return { isOpen: () => state.isOpen };
}
