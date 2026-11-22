import type { Logger } from '@heynixie/logger';
import type { GuestSession, VNCStream } from '../make-guest-session';
import { makeClientMessageFilter } from './make-client-message-filter';
import type { WatchConnection, WatchSocket } from './types';

export interface WatchHost {
  readonly watches: { count: number };
  readonly logger: Logger;

  // keeps the sandbox awake until the returned function runs
  readonly hold: () => () => void;

  // the guest to open the stream on, or null when none can start; it wakes the sandbox
  readonly readGuest: (isEnded: () => boolean) => Promise<GuestSession | null>;
}

interface WatchState {
  stream: VNCStream | null;
  isEnded: boolean;

  // the viewer's bytes that came before the stream opened
  readonly pending: Uint8Array[];
}

// A watch counts as open from the moment its socket opens, so the assistant sees that someone is
// there while the sandbox still wakes.
export function openComputerWatch(host: WatchHost, socket: WatchSocket): WatchConnection {
  host.watches.count += 1;

  const releaseHold = host.hold();
  const filter = makeClientMessageFilter();
  const state: WatchState = { stream: null, isEnded: false, pending: [] };

  const end = (): void => {
    if (state.isEnded) {
      return;
    }

    state.isEnded = true;
    host.watches.count -= 1;
    state.stream?.close();
    releaseHold();
  };

  const endAndClose = (): void => {
    end();

    socket.close();
  };

  void startStream(host, { state, socket, end: endAndClose });

  return {
    end,
    receive: (bytes) => {
      if (state.isEnded) {
        return;
      }

      const result = filter.push(bytes);

      for (const message of result.forward) {
        if (state.stream === null) {
          state.pending.push(message);
        } else {
          void sendToStream(host, state.stream, message);
        }
      }

      if (result.isMalformed) {
        host.logger('computer.watch_malformed', {}, 'warn');

        endAndClose();
      }
    },
  };
}

interface StreamStart {
  readonly state: WatchState;
  readonly socket: WatchSocket;
  readonly end: () => void;
}

async function startStream(host: WatchHost, start: StreamStart): Promise<void> {
  try {
    const guest = await host.readGuest(() => start.state.isEnded);

    if (start.state.isEnded) {
      return;
    }

    if (guest === null) {
      host.logger('computer.watch_unavailable', {}, 'warn');
      start.end();

      return;
    }

    const stream = guest.openStream({
      onData: (bytes) => {
        if (!start.state.isEnded) {
          start.socket.send(bytes);
        }
      },
      onClose: start.end,
    });

    start.state.stream = stream;

    for (const message of start.state.pending.splice(0)) {
      void sendToStream(host, stream, message);
    }
  } catch (error) {
    host.logger('computer.watch_failed', { reason: String(error) }, 'warn');
    start.end();
  }
}

async function sendToStream(host: WatchHost, stream: VNCStream, bytes: Uint8Array): Promise<void> {
  try {
    await stream.send(bytes);
  } catch (error) {
    host.logger('computer.watch_send_failed', { reason: String(error) }, 'warn');
  }
}
