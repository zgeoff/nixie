import { onTestFinished } from 'bun:test';
import { once } from 'node:events';
import type { Server, Socket } from 'node:net';
import { createServer } from 'node:net';
import { waitForSettled } from '@heynixie/async';
import type { ImpPort } from '../types';
import type { SleepingForward } from './build-fake-sleeps';

export interface FakeForwardOptions {
  readonly port: number;
  readonly onConnection: Parameters<ImpPort['openReverseForward']>[2];
  readonly onStop: () => void;

  readonly waitForAwake?: () => Promise<void>;
}

export function startFakeForward(options: FakeForwardOptions): SleepingForward {
  const ending = createEnding();

  const sockets = new Set<Socket>();

  const server = createServer((socket) => {
    startGuestRelay(options, sockets, socket);
  });

  server.once('error', ending.listening.reject);
  void startListener(options, server, ending);

  onTestFinished(() => {
    ending.stop();

    return stopForward(server, sockets);
  });

  return {
    listening: ending.listening.promise,
    ended: ending.ended.promise,
    stop: () => {
      options.onStop();
      server.close();
      ending.stopAs('stopped');
    },
    stopAsLost: () => {
      void stopForward(server, sockets);
      ending.stopAs('lost');
    },
  };
}

interface Ending {
  readonly listening: PromiseWithResolvers<unknown>;
  readonly ended: PromiseWithResolvers<{ readonly kind: string }>;
  readonly isEnded: () => boolean;

  readonly stop: () => void;
  readonly stopAs: (kind: string) => void;
}

function createEnding(): Ending {
  const listening = Promise.withResolvers<unknown>();
  const ended = Promise.withResolvers<{ readonly kind: string }>();
  let isEnded = false;

  void waitForSettled(listening.promise);

  return {
    listening,
    ended,
    isEnded: () => isEnded,
    stop: () => {
      isEnded = true;
    },
    stopAs: (kind) => {
      isEnded = true;

      listening.reject(new Error(`the forward ended as ${kind} before it listened`));
      ended.resolve({ kind });
    },
  };
}

function startGuestRelay(options: FakeForwardOptions, sockets: Set<Socket>, socket: Socket): void {
  sockets.add(socket);
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
}

async function startListener(
  options: FakeForwardOptions,

  server: Server,

  ending: Ending,
): Promise<void> {
  await options.waitForAwake?.();

  if (!ending.isEnded()) {
    server.listen(options.port, '127.0.0.1', () => {
      ending.listening.resolve(options.port);
    });
  }
}

async function stopForward(server: Server, sockets: ReadonlySet<Socket>): Promise<void> {
  for (const socket of sockets) {
    socket.destroy();
  }

  if (server.listening) {
    server.close();

    await once(server, 'close');
  }
}
