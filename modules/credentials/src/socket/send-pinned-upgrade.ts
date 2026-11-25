import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { request as requestHTTPS } from 'node:https';
import { isIP } from 'node:net';
import type { Duplex } from 'node:stream';
import { toBareHost } from '@heynixie/egress';
import { makePinnedLookup } from '../fetch/make-pinned-lookup';
import { pickPinnedPort } from '../fetch/pick-pinned-port';

export interface PinnedUpgrade {
  // an https URL: the caller maps wss to https
  readonly url: URL;

  // the address the caller checked, which the connection uses and no lookup replaces
  readonly address: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;

  // a certificate authority a test site signs with
  readonly ca?: string;
}

export interface UpgradedConnection {
  readonly socket: Duplex;

  // bytes that arrived with the handshake's reply
  readonly head: Buffer;
}

const websocketGUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Opens a pinned TLS connection and asks it to become a WebSocket. It resolves once the server
// answers 101 with the accept value that this request's key demands, and rejects on any other
// answer, which it never reads.
export function sendPinnedUpgrade(pinned: PinnedUpgrade): Promise<UpgradedConnection> {
  const host = toBareHost(pinned.url.hostname);
  const key = randomBytes(16).toString('base64');
  const connection = Promise.withResolvers<UpgradedConnection>();

  const outgoing = requestHTTPS({
    host,
    port: pickPinnedPort(pinned.url),
    path: `${pinned.url.pathname}${pinned.url.search}`,
    method: 'GET',
    headers: {
      ...pinned.headers,
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-websocket-version': '13',
      'sec-websocket-key': key,
    },
    lookup: makePinnedLookup(pinned.address),
    signal: pinned.signal,
    agent: false,
    ...(isIP(host) === 0 ? { servername: host } : {}),
    ...(pinned.ca === undefined ? {} : { ca: pinned.ca }),
  });

  outgoing.on('upgrade', (reply: IncomingMessage, socket: Duplex, head: Buffer) => {
    const accept = createHash('sha1')
      .update(key + websocketGUID)
      .digest('base64');

    if (reply.headers['sec-websocket-accept'] === accept) {
      connection.resolve({ socket, head });
    } else {
      socket.destroy();
      connection.reject(new Error('the server answered the upgrade with a wrong accept value'));
    }
  });

  outgoing.on('response', (reply: IncomingMessage) => {
    reply.destroy();

    connection.reject(
      new Error(`the server answered ${String(reply.statusCode)} in place of an upgrade`),
    );
  });

  outgoing.on('error', connection.reject);
  outgoing.end();

  return connection.promise;
}
