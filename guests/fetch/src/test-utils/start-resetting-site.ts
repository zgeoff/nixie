import { onTestFinished } from 'bun:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:tls';
import { createTestCertificate } from './create-test-certificate';

export interface ResettingSite {
  readonly port: number;

  readonly ca: string;
}

// Bun's own server always answers a request, so a site that completes TLS and then drops the
// connection needs a plain TLS server.
export async function startResettingSite(names: readonly string[]): Promise<ResettingSite> {
  const certificate = await createTestCertificate(names);

  const server = createServer({ cert: certificate.cert, key: certificate.key }, (socket) => {
    socket.once('data', () => {
      socket.destroy();
    });
  });

  server.listen(0, '127.0.0.1');

  await once(server, 'listening');

  onTestFinished(() => {
    server.close();
  });

  const address: AddressInfo | string | null = server.address();

  return {
    port: typeof address === 'object' && address !== null ? address.port : 0,
    ca: certificate.cert,
  };
}
