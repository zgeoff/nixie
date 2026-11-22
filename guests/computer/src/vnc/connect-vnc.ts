import { isInputMessage } from './is-input-message';
import type { PressedInput } from './make-pressed-input';
import { makePressedInput } from './make-pressed-input';
import type { VNCLink, VNCLinkEvents } from './types';

export interface VNCTarget {
  // the Unix socket of the VNC server
  readonly path: string;

  // how long a missing socket is tried again, for a VNC server that has not started listening
  readonly waitMs: number;
}

// The messages written to the VNC server and not yet taken by the socket, in order. The first may
// be half written, and then `sent` is how many of its bytes the socket took.
interface Backlog {
  chunks: Uint8Array[];
  sent: number;

  // the keys and buttons that the messages already written hold pressed
  readonly pressed: PressedInput;

  // whether the link has ended, so the socket closes once the backlog has gone out
  isEnding: boolean;
}

// Connects to the VNC server on its Unix socket. The server listens on no TCP port, and the socket's
// folder is closed to every account but the server's and the guest's, so no other path reaches it.
export async function connectVNC(target: VNCTarget, events: VNCLinkEvents): Promise<VNCLink> {
  const backlog: Backlog = {
    chunks: [],
    sent: 0,
    pressed: makePressedInput(),
    isEnding: false,
  };

  const socket = await connectWhenListening(target, {
    data: (_socket, data) => {
      events.onData(new Uint8Array(data));
    },
    drain: (open) => {
      flushBacklog(open, backlog);
    },
    close: () => {
      events.onClose();
    },
    error: () => {
      events.onClose();
    },
  });

  return {
    write: (bytes) => {
      backlog.chunks.push(bytes);

      flushBacklog(socket, backlog);
    },
    flush: () => {
      dropInput(backlog);
      flushBacklog(socket, backlog);
    },
    end: () => {
      backlog.isEnding = true;

      flushBacklog(socket, backlog);
    },
  };
}

const retryDelayMs = 100;

// The guest starts the VNC server beside the display and starts reading the wire straight after, so
// a watch that wakes the sandbox opens its stream before the server listens. A supervised server
// that restarts leaves the same gap.
async function connectWhenListening(
  target: VNCTarget,
  handler: Bun.SocketHandler<undefined>,
): Promise<Bun.Socket> {
  const deadlineMs = Date.now() + target.waitMs;

  for (;;) {
    try {
      return await Bun.connect({ unix: target.path, socket: handler });
    } catch (error) {
      if (Date.now() + retryDelayMs > deadlineMs) {
        throw error;
      }

      await Bun.sleep(retryDelayMs);
    }
  }
}

interface WritableSocket {
  readonly write: (bytes: Uint8Array) => number;
  readonly end: () => void;
}

function flushBacklog(socket: WritableSocket, backlog: Backlog): void {
  for (;;) {
    const [head] = backlog.chunks;

    if (head === undefined) {
      if (backlog.isEnding) {
        socket.end();
      }

      return;
    }

    const written = socket.write(head.subarray(backlog.sent));

    backlog.sent += written;

    if (backlog.sent < head.byteLength) {
      return;
    }

    backlog.pressed.track(head);
    backlog.chunks.shift();

    backlog.sent = 0;
  }
}

// Drops the key and pointer messages that the socket has not taken, and queues a release for each
// key and button that the server holds pressed, so a dropped key-up still reaches it. Other
// messages stay. A message that is half written finishes, or the server reads its rest as a message.
function dropInput(backlog: Backlog): void {
  const isHalfWritten = backlog.sent > 0;
  const [head] = backlog.chunks;
  const ahead = isHalfWritten ? head : undefined;

  const kept = backlog.chunks.filter(
    (chunk, index) => (index === 0 && isHalfWritten) || !isInputMessage(chunk),
  );

  const releases = backlog.pressed.listReleases(ahead);

  backlog.chunks = [...kept, ...releases];
}
