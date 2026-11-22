import type { ContractClient } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { buildSocketURL } from './build-socket-url';
import type { StartViewer, WatchState } from './types';

export interface ComputerWatchRun {
  readonly client: ContractClient;
  readonly target: HTMLElement;
  readonly startViewer: StartViewer;
  readonly signal: AbortSignal;
  readonly onState: (state: WatchState) => void;
}

// Asks the API for a ticket, opens the socket it names and hands the socket to the viewer. A run ends
// when its signal aborts: it stops the viewer and closes the socket.
export async function runComputerWatch(run: ComputerWatchRun): Promise<void> {
  run.onState({ kind: 'connecting' });

  const streamURL = await readStreamURL(run);

  if (streamURL === null || run.signal.aborted) {
    return;
  }

  const socket = new WebSocket(buildSocketURL(streamURL, globalThis.location.href));

  const connected = { isConnected: false };

  socket.addEventListener('open', () => {
    if (!connected.isConnected && !run.signal.aborted) {
      run.onState({ kind: 'waking' });
    }
  });

  const stop = await startViewerQuietly(run, socket, connected);

  if (stop === null) {
    return;
  }

  const end = (): void => {
    stop();

    socket.close();
  };

  if (run.signal.aborted) {
    end();
  } else {
    run.signal.addEventListener('abort', end, { once: true });
  }
}

async function readStreamURL(run: ComputerWatchRun): Promise<string | null> {
  try {
    const watch = await run.client.computer.watch(
      { clientActionID: crypto.randomUUID() },
      { signal: run.signal },
    );

    return watch.streamURL;
  } catch (error) {
    if (!run.signal.aborted) {
      run.onState({
        kind:
          error instanceof ORPCError && error.code === 'COMPUTER_UNAVAILABLE'
            ? 'unavailable'
            : 'failed',
      });
    }

    return null;
  }
}

interface ConnectionState {
  isConnected: boolean;
}

async function startViewerQuietly(
  run: ComputerWatchRun,
  socket: WebSocket,
  connected: ConnectionState,
): Promise<(() => void) | null> {
  try {
    return await run.startViewer(run.target, socket, {
      onConnect: () => {
        connected.isConnected = true;

        if (!run.signal.aborted) {
          run.onState({ kind: 'watching' });
        }
      },
      onDisconnect: () => {
        if (!run.signal.aborted) {
          run.onState({ kind: connected.isConnected ? 'ended' : 'failed' });
        }
      },
    });
  } catch {
    socket.close();

    if (!run.signal.aborted) {
      run.onState({ kind: 'failed' });
    }

    return null;
  }
}
