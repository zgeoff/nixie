import type { ContractClient } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { buildSocketURL } from './build-socket-url';
import type { LoadViewer, StartViewer, Viewer, WatchState } from './types';

export interface ComputerWatchRun {
  readonly client: ContractClient;
  readonly target: HTMLElement;
  readonly loadViewer: LoadViewer;
  readonly signal: AbortSignal;
  readonly onState: (state: WatchState) => void;

  // called with the viewer once it starts, and with null when the run ends
  readonly onViewer: (viewer: Viewer | null) => void;
}

// Asks the API for a ticket, opens the socket it names and hands the socket to the viewer. A run ends
// when its signal aborts: it stops the viewer and closes the socket.
export async function runComputerWatch(run: ComputerWatchRun): Promise<void> {
  run.onState({ kind: 'connecting' });

  const [streamURL, startViewer] = await Promise.all([readStreamURL(run), loadViewerQuietly(run)]);

  if (streamURL === null || startViewer === null || run.signal.aborted) {
    return;
  }

  const socket = new WebSocket(buildSocketURL(streamURL, globalThis.location.href));

  const connected = { isConnected: false };

  socket.addEventListener('open', () => {
    if (!connected.isConnected && !run.signal.aborted) {
      run.onState({ kind: 'waking' });
    }
  });

  const viewer = startViewerQuietly({ run, startViewer, socket, connected });

  if (viewer === null) {
    return;
  }

  run.onViewer(viewer);

  const end = (): void => {
    run.onViewer(null);
    viewer.stop();
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

async function loadViewerQuietly(run: ComputerWatchRun): Promise<StartViewer | null> {
  try {
    return await run.loadViewer();
  } catch {
    if (!run.signal.aborted) {
      run.onState({ kind: 'failed' });
    }

    return null;
  }
}

interface ConnectionState {
  isConnected: boolean;
}

interface ViewerStart {
  readonly run: ComputerWatchRun;
  readonly startViewer: StartViewer;
  readonly socket: WebSocket;
  readonly connected: ConnectionState;
}

function startViewerQuietly(start: ViewerStart): Viewer | null {
  const run = start.run;

  try {
    return start.startViewer(run.target, start.socket, {
      onConnect: () => {
        start.connected.isConnected = true;

        if (!run.signal.aborted) {
          run.onState({ kind: 'watching' });
        }
      },
      onDisconnect: () => {
        if (!run.signal.aborted) {
          run.onState({ kind: start.connected.isConnected ? 'ended' : 'failed' });
        }
      },
    });
  } catch {
    start.socket.close();

    if (!run.signal.aborted) {
      run.onState({ kind: 'failed' });
    }

    return null;
  }
}
