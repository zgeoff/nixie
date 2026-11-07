import { onTestFinished } from 'bun:test';

export interface SilentListener {
  readonly port: number;

  readonly chunks: readonly Uint8Array[];
}

// Loopback answers every SYN, so a listener that accepts and never writes is how a test reaches a
// host that drops its packets: a TLS handshake to it never ends.
export function startSilentListener(): SilentListener {
  const chunks: Uint8Array[] = [];

  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data: (_socket, bytes) => {
        chunks.push(bytes);
      },
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  return { port: listener.port, chunks };
}
