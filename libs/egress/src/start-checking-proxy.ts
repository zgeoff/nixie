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

  // asks the server to scan the headers and body of a plain request before the proxy sends them; a
  // rejection refuses the request
  readonly scanText: (text: string) => Promise<void>;

  // whether a CONNECT tunnel may open. The proxy cannot read what a tunnel carries, so only a client
  // that scans each request itself, before it enters the tunnel, may tunnel.
  readonly canTunnel: boolean;
}

export interface CheckingProxy {
  readonly port: number;
  readonly stop: () => Promise<void>;
}

export interface SocketProxy {
  readonly stop: () => Promise<void>;
}

// A proxy on the loopback that every connection of a sandbox leaves through. It checks every
// address its host resolves to, connects to the address it checked, and asks the server to scan what
// it can read: the whole URL, the headers and the body of a plain request, and the host of a tunnel.
export async function startCheckingProxy(options: CheckingProxyOptions): Promise<CheckingProxy> {
  const proxy = buildProxyServer(options);

  await new Promise<void>((resolve, reject) => {
    proxy.server.once('error', reject);
    proxy.server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = proxy.server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the proxy has no port');
  }

  return { port: address.port, stop: proxy.stop };
}

// The same proxy on a Unix socket, which a process in another network namespace reaches by path.
export async function startSocketProxy(
  options: CheckingProxyOptions,
  socketPath: string,
): Promise<SocketProxy> {
  const proxy = buildProxyServer(options);

  await new Promise<void>((resolve, reject) => {
    proxy.server.once('error', reject);
    proxy.server.listen(socketPath, () => resolve());
  });

  return { stop: proxy.stop };
}

function buildProxyServer(options: CheckingProxyOptions): {
  readonly server: Server;
  readonly stop: () => Promise<void>;
} {
  const sockets = new Set<Socket>();

  const server = createServer((client) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    client.on('error', () => client.destroy());
    void serveClient(client, options);
  });

  return {
    server,
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

  if (method === 'CONNECT' && !options.canTunnel) {
    refuse(client, '403 Forbidden', 'an encrypted tunnel cannot be scanned for a secret');

    return;
  }

  const refusal = await readScanRefusal(() => options.scanURL(destination.scanned));

  if (refusal !== null) {
    refuse(client, '403 Forbidden', refusal);

    return;
  }

  const content = method === 'CONNECT' ? null : await readContent(client, headerLines, head.rest);

  if (content !== null && content.kind === 'refused') {
    refuse(client, content.status, content.reason);

    return;
  }

  if (content !== null) {
    const textRefusal = await readScanRefusal(() => options.scanText(content.text));

    if (textRefusal !== null) {
      refuse(client, '403 Forbidden', textRefusal);

      return;
    }
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
    if (content === null) {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');

      if (head.rest.byteLength > 0) {
        upstream.write(head.rest);
      }

      client.pipe(upstream);
      upstream.pipe(client);

      return;
    }

    upstream.write(buildForwardHead(method, destination.path, version, headerLines));
    upstream.write(content.body);

    // the client's later bytes are never forwarded, so a second request in one connection never
    // leaves unscanned
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
async function readScanRefusal(scan: () => Promise<void>): Promise<string | null> {
  try {
    await scan();

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'refused';
  }
}

const maxBodyBytes = 1024 * 1024;

type Content =
  | { readonly kind: 'read'; readonly text: string; readonly body: Buffer }
  | { readonly kind: 'refused'; readonly status: string; readonly reason: string };

// Reads the whole body of a plain request, which the proxy holds until the scan passes. A body that
// the proxy cannot hold or measure is refused, because it could not be scanned.
async function readContent(
  client: Socket,
  headerLines: readonly string[],
  rest: Buffer,
): Promise<Content> {
  const headers = headerLines.filter((line) => line !== '');
  const lengthLine = headers.find((line) => /^content-length:/iu.test(line));

  if (headers.some((line) => /^transfer-encoding:/iu.test(line))) {
    return {
      kind: 'refused',
      status: '411 Length Required',
      reason: 'a chunked body cannot be scanned for a secret',
    };
  }

  const length = lengthLine === undefined ? 0 : Number(lengthLine.split(':')[1]?.trim());

  if (!Number.isInteger(length) || length < 0) {
    return { kind: 'refused', status: '400 Bad Request', reason: 'the content length is invalid' };
  }

  if (length > maxBodyBytes) {
    return {
      kind: 'refused',
      status: '413 Payload Too Large',
      reason: 'a body this large cannot be scanned for a secret',
    };
  }

  if (headers.some((line) => /^expect:\s*100-continue/iu.test(line))) {
    client.write('HTTP/1.1 100 Continue\r\n\r\n');
  }

  const body = await readBytes(client, rest, length);

  if (body === null) {
    return { kind: 'refused', status: '400 Bad Request', reason: 'the body ended early' };
  }

  const kept = headers.filter((line) => !/^proxy-[a-z-]+:/iu.test(line));

  return { kind: 'read', text: `${kept.join('\n')}\n\n${body.toString('utf8')}`, body };
}

function readBytes(client: Socket, rest: Buffer, length: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let buffer = rest.subarray(0, length);

    if (buffer.byteLength >= length) {
      resolve(buffer);

      return;
    }

    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);

      if (buffer.byteLength >= length) {
        client.off('data', onData);
        client.pause();

        resolve(buffer.subarray(0, length));
      }
    };

    client.on('data', onData);
    client.once('close', () => resolve(null));
    client.resume();
  });
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
    (line) => line !== '' && !/^(?:proxy-[a-z-]+|connection|expect):/iu.test(line),
  );

  return `${method} ${path} ${version}\r\n${[...kept, 'Connection: close'].join('\r\n')}\r\n\r\n`;
}
