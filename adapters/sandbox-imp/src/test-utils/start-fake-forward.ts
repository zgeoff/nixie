import { onTestFinished } from 'bun:test';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type { ImpForward, ImpPort } from '../types';

export interface FakeForwardOptions {
  readonly port: number;
  readonly onConnection: Parameters<ImpPort['openReverseForward']>[2];
  readonly onStop: () => void;
}

// Stands in for an impd reverse forward: it listens on a local port, which a local guest reaches as
// the imp's loopback port, and hands each connection to onConnection as impd hands the adapter a
// relay. The listener closes when the test finishes.
export function startFakeForward(options: FakeForwardOptions): ImpForward {
  const ended = Promise.withResolvers<{ readonly kind: string }>();
  const listening = Promise.withResolvers<unknown>();
  const server = createServer((socket) => {
    options.onConnection((handlers) => {
      socket.on('data', (chunk: Uint8Array) => void handlers.onData(chunk));
      socket.once('end', handlers.onEof);
      socket.once('close', () => {
        handlers.onClose(false);
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
  onTestFinished(() => {
    server.close();
  });
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
