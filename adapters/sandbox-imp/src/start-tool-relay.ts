import { createConnection } from 'node:net';
import type { ToolTarget } from '@heynixie/sandbox';
import type { ImpRelay, ImpRelayHandlers } from './types';

// Relays one guest connection to the tool endpoint, with backpressure both ways. impd binds the
// forward to its imp, so the target belongs to the sandbox's run whatever the guest claims.
export function startToolRelay(
  target: ToolTarget,
  accept: (handlers: ImpRelayHandlers) => ImpRelay,
): void {
  const socket = 'path' in target ? createConnection(target.path) : createConnection(target);
  const relay = accept({
    onData: async (data) => {
      const written = Promise.withResolvers<void>();

      socket.write(data, () => {
        written.resolve();
      });
      await written.promise;
    },
    onEof: () => {
      socket.end();
    },
    onClose: () => {
      socket.destroy();
    },
  });

  socket.on('data', (chunk: Uint8Array) => {
    if (!relay.send(chunk)) {
      socket.pause();
      void waitForRoom(relay, () => socket.resume());
    }
  });
  socket.once('end', relay.sendEof);
  socket.once('close', relay.close);

  // a tool endpoint that is down or resets fails this one connection, never the host process
  socket.on('error', () => {
    relay.close();
  });
}

async function waitForRoom(relay: ImpRelay, resume: () => unknown): Promise<void> {
  await relay.waitForRoom();
  resume();
}
