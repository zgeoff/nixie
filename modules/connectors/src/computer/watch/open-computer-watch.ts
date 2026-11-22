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
  pendingBytes: number;
}

// A viewer sends a few hundred bytes before it hears from the desktop, so a wake that holds more
// than this is a viewer that floods the server while the sandbox starts.
const maxPendingBytes = 64 * 1024;

// A watch counts as open from the moment its socket opens, so the assistant sees that someone is
// there while the sandbox still wakes.
export function openComputerWatch(host: WatchHost, socket: WatchSocket): WatchConnection {
  host.watches.count += 1;

  const releaseHold = host.hold();
  const filter = makeClientMessageFilter();
  const state: WatchState = { stream: null, isEnded: false, pending: [], pendingBytes: 0 };

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
      let isFlooded = false;

      for (const message of result.forward) {
        if (state.stream !== null) {
          void sendToStream(host, state.stream, message, endAndClose);
        } else if (state.pendingBytes + message.byteLength > maxPendingBytes) {
          isFlooded = true;
          break;
        } else {
          state.pending.push(message);

          state.pendingBytes += message.byteLength;
        }
      }

      if (result.isMalformed) {
        host.logger('computer.watch_malformed', {}, 'warn');

        endAndClose();
      } else if (isFlooded) {
        host.logger('computer.watch_flooded', {}, 'warn');

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
    start.state.pendingBytes = 0;

    for (const message of start.state.pending.splice(0)) {
      void sendToStream(host, stream, message, start.end);
    }
  } catch (error) {
    host.logger('computer.watch_failed', { reason: String(error) }, 'warn');
    start.end();
  }
}

// A write to the guest that fails leaves a stream that no longer reaches the desktop, so it ends
// the watch.
async function sendToStream(
  host: WatchHost,
  stream: VNCStream,
  bytes: Uint8Array,
  end: () => void,
): Promise<void> {
  try {
    await stream.send(bytes);
  } catch (error) {
    host.logger('computer.watch_send_failed', { reason: String(error) }, 'warn');

    end();
  }
}
