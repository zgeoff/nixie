import { onTestFinished } from 'bun:test';
import { once } from 'node:events';
import type { Server, Socket } from 'node:net';
import { createServer } from 'node:net';
import type { ImpPort } from '../types';
import type { SleepingForward } from './build-fake-sleeps';

export interface FakeForwardOptions {
  readonly port: number;
  readonly onConnection: Parameters<ImpPort['openReverseForward']>[2];
  readonly onStop: () => void;

  // resolves once the imp runs, as impd answers a listen only after a sleep that holds the imp ends
  readonly waitForAwake?: () => Promise<void>;
}

// Stands in for an impd reverse forward: it listens on a local port, which a local guest reaches as
// the imp's loopback port, and relays each connection as impd does. Its listener and connections
// close at a lost stop, as when the imp's VM stops, and when the test finishes.
export function startFakeForward(options: FakeForwardOptions): SleepingForward {
  const ending = buildEnding();
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    startGuestRelay(options, sockets, socket);
  });

  server.once('error', ending.listening.reject);
  void startListener(options, server, ending);
  onTestFinished(() => stopForward(server, sockets));
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
  readonly stopAs: (kind: string) => void;
}

// a forward that ends before it listens never listens, and its listening rejects, as impd's does
function buildEnding(): Ending {
  const listening = Promise.withResolvers<unknown>();
  const ended = Promise.withResolvers<{ readonly kind: string }>();
  let isEnded = false;

  void waitForSettled(listening.promise);
  return {
    listening,
    ended,
    isEnded: () => isEnded,
    stopAs: (kind) => {
      isEnded = true;
      listening.reject(new Error(`the forward ended as ${kind} before it listened`));
      ended.resolve({ kind });
    },
  };
}

// marks the rejection handled, so a forward that never listens raises no unhandled rejection
async function waitForSettled(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // the forward's owner reads the rejection from listening
  }
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fake's own sockets
function startGuestRelay(options: FakeForwardOptions, sockets: Set<Socket>, socket: Socket): void {
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
}

// listens once the imp is awake, unless the forward ended while it waited
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
