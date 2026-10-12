import { onTestFinished } from 'bun:test';
import { once } from 'node:events';
import type { Server, Socket } from 'node:net';
import { createServer } from 'node:net';
import type { ImpForward, ImpPort } from '../types';

export interface FakeForwardOptions {
  readonly port: number;
  readonly onConnection: Parameters<ImpPort['openReverseForward']>[2];
  readonly onStop: () => void;
}

// Stands in for an impd reverse forward: it listens on a local port, which a local guest reaches as
// the imp's loopback port, and hands each connection to onConnection as impd hands the adapter a
// relay. The listener and every open connection close when the test finishes.
export function startFakeForward(options: FakeForwardOptions): ImpForward {
  const ended = Promise.withResolvers<{ readonly kind: string }>();
  const listening = Promise.withResolvers<unknown>();
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);

    // a guest that resets its connection raises an error, which the close then reports as lost
    socket.on('error', () => {});
    socket.once('close', () => {
      sockets.delete(socket);
    });
    options.onConnection((handlers) => {
      socket.on('data', (chunk: Uint8Array) => void handlers.onData(chunk));
      socket.once('end', handlers.onEof);
      socket.once('close', (hadError) => {
        handlers.onClose(hadError);
      });
      return {
        send: (data) => socket.write(data),
        waitForRoom: async () => {
          await once(socket, 'drain');
        },
        sendEof: () => {
          socket.end();
        },
        close: () => {
          socket.destroy();
        },
      };
    });
  });

  server.once('error', listening.reject);
  server.listen(options.port, '127.0.0.1', () => {
    listening.resolve(options.port);
  });
  onTestFinished(() => stopForward(server, sockets));
  return {
    listening: listening.promise,
    ended: ended.promise,
    stop: () => {
      options.onStop();
      server.close();
      ended.resolve({ kind: 'stopped' });
    },
  };
}

// Closes every open guest connection, then waits for the listener to close, so no connection
// outlives the test. A forward the test stopped has closed its listener already.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own listener
async function stopForward(server: Server, sockets: ReadonlySet<Socket>): Promise<void> {
  for (const socket of sockets) {
    socket.destroy();
  }
  if (server.listening) {
    server.close();
    await once(server, 'close');
  }
}
