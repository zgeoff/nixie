import type { Socket } from 'node:net';
import { createConnection, createServer } from 'node:net';
import type { ToolTarget } from '@heynixie/sandbox';

export interface ToolRelay {
  readonly port: number;
  readonly stop: () => Promise<void>;
}

// Listens on a free loopback port and relays each connection to the tool target, the local stand-in
// for imp's reverse forward. It never listens on an address another machine reaches.
export async function startToolRelay(target: ToolTarget): Promise<ToolRelay> {
  const sockets = new Set<Socket>();
  const server = createServer((guest) => {
    const tool = 'path' in target ? createConnection(target.path) : createConnection(target);

    for (const socket of [guest, tool]) {
      sockets.add(socket);
      socket.once('close', () => {
        sockets.delete(socket);
      });
    }
    guest.pipe(tool).once('error', () => {
      guest.destroy();
    });
    tool.pipe(guest).once('error', () => {
      tool.destroy();
    });
  });
  const listening = Promise.withResolvers<void>();

  server.once('error', listening.reject);
  server.listen(0, '127.0.0.1', listening.resolve);
  await listening.promise;

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the tool relay has no TCP address');
  }
  return {
    port: address.port,
    stop: async () => {
      const closed = Promise.withResolvers<void>();

      server.close(() => {
        closed.resolve();
      });
      for (const socket of sockets) {
        socket.destroy();
      }
      await closed.promise;
    },
  };
}
