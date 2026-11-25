import type { Logger } from '@heynixie/logger';
import type { GuestSession, VNCStream } from '../make-guest-session';
import { makeClientMessageFilter } from './make-client-message-filter';
import type { ServerMessageFilter } from './make-server-message-filter';
import { makeServerMessageFilter } from './make-server-message-filter';
import type { WatchConnection, WatchSocket } from './types';

export interface WatchHost {
  readonly watches: { count: number };
  readonly logger: Logger;

  // keeps the sandbox awake until the returned function runs
  readonly hold: () => () => void;

  // the guest to open the stream on, or null when none can start; it wakes the sandbox
  readonly readGuest: (isEnded: () => boolean) => Promise<GuestSession | null>;
}

// What a watch asks of the hold on the desktop.
export interface WatchInput {
  // whether this viewer's device holds the desktop now
  readonly canInput: () => boolean;

  // called when a key or pointer message from the viewer passes on to the VNC server
  readonly onInput: () => void;
}

interface WatchState {
  stream: VNCStream | null;
  isEnded: boolean;

  // the viewer's bytes that came before the stream opened
  readonly pending: Uint8Array[];
  pendingBytes: number;

  // the release of the viewer's input that went out last
  release: Promise<void>;
}

// A viewer sends a few hundred bytes before it hears from the desktop, so a wake that holds more
// than this is a viewer that floods the server while the sandbox starts.
const maxPendingBytes = 64 * 1024;

// A watch counts as open from the moment its socket opens, so the assistant sees that someone is
// there while the sandbox still wakes.
export function openComputerWatch(
  host: WatchHost,
  socket: WatchSocket,
  input: WatchInput,
): WatchConnection {
  host.watches.count += 1;

  const releaseHold = host.hold();
  const serverFilter = makeServerMessageFilter({ canInput: input.canInput });

  const filter = makeClientMessageFilter({
    canInput: input.canInput,
    readPixelBits: serverFilter.readPixelBits,
  });

  const state: WatchState = {
    stream: null,
    isEnded: false,
    pending: [],
    pendingBytes: 0,
    release: Promise.resolve(),
  };

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

  void startStream(host, { state, socket, serverFilter, end: endAndClose });

  return {
    end,
    releaseInput: () => {
      releaseInput(host, state, filter, endAndClose);
    },
    closeAfterRelease: () => {
      void closeAfter(state.release, endAndClose);
    },
    receive: (bytes) => {
      if (state.isEnded) {
        return;
      }

      if (state.stream === null) {
        if (state.pendingBytes + bytes.byteLength > maxPendingBytes) {
          host.logger('computer.watch_flooded', {}, 'warn');

          endAndClose();

          return;
        }

        state.pendingBytes += bytes.byteLength;
      }

      const result = filter.push(bytes);

      if (result.isInput) {
        input.onInput();
      }

      for (const message of result.forward) {
        if (state.stream === null) {
          state.pending.push(message);
        } else {
          void sendToStream(host, state.stream, message, endAndClose);
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
  readonly serverFilter: ServerMessageFilter;
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
          passToViewer(host, start, bytes);
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

// Sends the viewer what the desktop sent, less the clipboard text that it may not have. Bytes that
// the filter cannot frame end the watch, because the clipboard text could be among them.
function passToViewer(host: WatchHost, start: StreamStart, bytes: Uint8Array): void {
  const result = start.serverFilter.push(bytes);

  for (const message of result.forward) {
    start.socket.send(message);
  }

  if (result.isMalformed) {
    host.logger('computer.watch_malformed', {}, 'warn');
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

// the viewer's whole-screen update request, which stands in for one that a flush may have dropped
const fullUpdateRequest = new Uint8Array([3, 0, 0, 0, 0, 0, 0x05, 0x00, 0x03, 0x20]);

function releaseInput(
  host: WatchHost,
  state: WatchState,
  filter: ReturnType<typeof makeClientMessageFilter>,
  end: () => void,
): void {
  const releases = filter.collectReleases();
  const kept = state.pending.filter((message) => !filter.isInputMessage(message));

  state.pending.splice(0, state.pending.length, ...kept);

  const stream = state.stream;

  if (stream === null || state.isEnded) {
    return;
  }

  state.release = sendRelease(host, stream, [...releases, fullUpdateRequest], end);
}

async function sendRelease(
  host: WatchHost,
  stream: VNCStream,
  messages: readonly Uint8Array[],
  end: () => void,
): Promise<void> {
  try {
    await stream.flush();

    for (const message of messages) {
      await stream.send(message);
    }
  } catch (error) {
    host.logger('computer.watch_send_failed', { reason: String(error) }, 'warn');

    end();
  }
}

async function closeAfter(release: Promise<void>, close: () => void): Promise<void> {
  await release;

  close();
}
