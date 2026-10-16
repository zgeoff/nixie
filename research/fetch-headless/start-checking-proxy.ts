// A checking CONNECT proxy on loopback, the only way out for the browser. Each tunnel runs the
// fetcher's own hop planner: https only, every A and AAAA address checked, and the socket opened to
// the checked address, so the browser never resolves a host and never picks an address.
import type { IncomingMessage } from 'node:http';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { connect } from 'node:net';
// @boundaries-ignore a spike imports the code it measures
import { makeAddressCheck } from '../../guests/fetch/src/make-address-check';
// @boundaries-ignore a spike imports the code it measures
import { planHop } from '../../guests/fetch/src/plan-hop';
// @boundaries-ignore a spike imports the code it measures
import { resolveHostAddresses } from '../../guests/fetch/src/resolve-host-addresses';

export interface TunnelRecord {
  readonly host: string;
  readonly port: number;
  readonly decision: 'connect' | 'refused';
  readonly reason?: string;

  // the checked address the tunnel connected to
  readonly address?: string;
}

export interface CheckingProxy {
  readonly port: number;
  readonly tunnels: TunnelRecord[];
  readonly bytes: { up: number; down: number };
  readonly stop: () => void;
}

export async function startCheckingProxy(deniedRanges: readonly string[]): Promise<CheckingProxy> {
  const checkAddress = makeAddressCheck(deniedRanges);
  const tunnels: TunnelRecord[] = [];
  const bytes = { up: 0, down: 0 };

  // a plain-HTTP proxy request, never a tunnel: refused, because the fetcher reads https only
  const server = createServer((request, response) => {
    tunnels.push({ host: request.url ?? '', port: 80, decision: 'refused', reason: 'not https' });
    response.writeHead(403).end();
  });

  server.on('connect', (request: IncomingMessage, client: Socket, head: Buffer) => {
    void runTunnel(request.url ?? '', client, head);
  });

  async function runTunnel(target: string, client: Socket, head: Buffer): Promise<void> {
    const url = `https://${target}/`;
    const parsed = URL.canParse(url) ? new URL(url) : null;
    const port = parsed === null || parsed.port === '' ? 443 : Number(parsed.port);
    const host = parsed?.hostname ?? target;

    client.on('error', () => {});

    if (port !== 443) {
      tunnels.push({ host, port, decision: 'refused', reason: 'port is not 443' });
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }

    const hop = await planHop(url, {
      checkAddress,
      resolveHost: resolveHostAddresses,
      signal: AbortSignal.timeout(5000),
    }).catch((error: unknown) => ({ kind: 'refused' as const, reason: String(error) }));

    if (hop.kind === 'refused') {
      tunnels.push({ host, port, decision: 'refused', reason: hop.reason });
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }

    tunnels.push({ host, port, decision: 'connect', address: hop.address });

    const upstream = connect({ host: hop.address, port });

    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());

    upstream.on('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      bytes.up += head.length;
      client.on('data', (chunk: Buffer) => (bytes.up += chunk.length));
      upstream.on('data', (chunk: Buffer) => (bytes.down += chunk.length));
      client.pipe(upstream);
      upstream.pipe(client);
    });
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the proxy has no port');
  }

  return {
    port: address.port,
    tunnels,
    bytes,
    stop: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
