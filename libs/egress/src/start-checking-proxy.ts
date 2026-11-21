import type { Server, Socket } from 'node:net';
import { connect, createServer } from 'node:net';
import type { AddressCheck } from './make-address-check';
import { toBareHost } from './to-bare-host';

export interface CheckingProxyOptions {
  readonly checkAddress: AddressCheck;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;

  // asks the server to scan the URL of a request before the proxy resolves its host; a rejection
  // refuses the request
  readonly scanURL: (url: string) => Promise<void>;
}

export interface CheckingProxy {
  readonly port: number;
  readonly stop: () => Promise<void>;
}

// A proxy on the loopback that every connection of a sandbox leaves through. It checks every
// address its host resolves to, connects to the address it checked, and asks the server to scan the
// URL it can read: the whole URL of a plain request, and the host of a tunnel.
export async function startCheckingProxy(options: CheckingProxyOptions): Promise<CheckingProxy> {
  const sockets = new Set<Socket>();

  const server = createServer((client) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    client.on('error', () => client.destroy());
    void serveClient(client, options);
  });

  await listen(server);

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the proxy has no port');
  }

  return {
    port: address.port,
    stop: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }

        server.close(() => resolve());
      }),
  };
}

async function serveClient(client: Socket, options: CheckingProxyOptions): Promise<void> {
  const head = await readHead(client);

  if (head === null) {
    client.destroy();

    return;
  }

  const [requestLine = '', ...headerLines] = head.text.split('\r\n');
  const [method = '', target = '', version = 'HTTP/1.1'] = requestLine.split(' ');
  const destination = method === 'CONNECT' ? parseTunnel(target) : parsePlain(target);

  if (destination === null) {
    refuse(client, '400 Bad Request', 'the request names no host');

    return;
  }

  const refusal = await readScanRefusal(options, destination.scanned);

  if (refusal !== null) {
    refuse(client, '403 Forbidden', refusal);

    return;
  }

  const address = await readAddress(destination.host, options);

  if (address === null) {
    refuse(client, '403 Forbidden', 'the host is not a public address');

    return;
  }

  const upstream = connect({ host: address, port: destination.port });

  upstream.on('error', () => {
    refuse(client, '502 Bad Gateway', 'the connection failed');
  });

  client.on('close', () => upstream.destroy());

  upstream.once('connect', () => {
    if (method === 'CONNECT') {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    } else {
      upstream.write(buildForwardHead(method, destination.path, version, headerLines));
    }

    if (head.rest.byteLength > 0) {
      upstream.write(head.rest);
    }

    client.pipe(upstream);
    upstream.pipe(client);
  });
}

interface Head {
  readonly text: string;
  readonly rest: Buffer;
}

const maxHeadBytes = 65_536;

function readHead(client: Socket): Promise<Head | null> {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);

    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);

      const end = buffer.indexOf('\r\n\r\n');

      if (end !== -1) {
        client.off('data', onData);
        client.pause();

        resolve({
          text: buffer.subarray(0, end).toString('latin1'),
          rest: buffer.subarray(end + 4),
        });

        return;
      }

      if (buffer.byteLength > maxHeadBytes) {
        client.off('data', onData);

        resolve(null);
      }
    };

    client.on('data', onData);
    client.once('close', () => resolve(null));
  });
}

interface Destination {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly scanned: string;
}

function parseTunnel(target: string): Destination | null {
  const index = target.lastIndexOf(':');
  const host = index === -1 ? target : target.slice(0, index);
  const port = index === -1 ? 443 : Number(target.slice(index + 1));

  if (host === '' || !Number.isInteger(port) || port < 1 || port > 65_535) {
    return null;
  }

  const shown = port === 443 ? '' : `:${String(port)}`;

  return { host: toBareHost(host), port, path: '', scanned: `https://${host}${shown}/` };
}

function parsePlain(target: string): Destination | null {
  if (!URL.canParse(target)) {
    return null;
  }

  const url = new URL(target);

  if (url.protocol !== 'http:') {
    return null;
  }

  return {
    host: toBareHost(url.hostname),
    port: url.port === '' ? 80 : Number(url.port),
    path: `${url.pathname}${url.search}`,
    scanned: target,
  };
}

function refuse(client: Socket, status: string, reason: string): void {
  client.end(
    `HTTP/1.1 ${status}\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${reason}`,
  );
}

// the reason the scan refused, or null when it passed
async function readScanRefusal(options: CheckingProxyOptions, url: string): Promise<string | null> {
  try {
    await options.scanURL(url);

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'refused';
  }
}

async function readAddress(host: string, options: CheckingProxyOptions): Promise<string | null> {
  try {
    const addresses = await options.resolveHost(host);

    const [first] = addresses;

    return first !== undefined && addresses.every((address) => options.checkAddress(address))
      ? first
      : null;
  } catch {
    return null;
  }
}

function buildForwardHead(
  method: string,
  path: string,
  version: string,
  headerLines: readonly string[],
): string {
  const kept = headerLines.filter(
    (line) => line !== '' && !/^(?:proxy-[a-z-]+|connection):/iu.test(line),
  );

  return `${method} ${path} ${version}\r\n${[...kept, 'Connection: close'].join('\r\n')}\r\n\r\n`;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
}
