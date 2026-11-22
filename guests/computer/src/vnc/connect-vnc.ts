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
}

// Connects to the VNC server on its Unix socket. The server listens on no TCP port, and the socket's
// folder is closed to every account but the server's and the guest's, so no other path reaches it.
export async function connectVNC(target: VNCTarget, events: VNCLinkEvents): Promise<VNCLink> {
  const backlog: Backlog = { chunks: [], sent: 0 };

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
      // a message that is half written has to finish, or the server would read the rest as a message
      backlog.chunks = backlog.sent > 0 ? backlog.chunks.slice(0, 1) : [];
    },
    end: () => {
      socket.end();
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
}

function flushBacklog(socket: WritableSocket, backlog: Backlog): void {
  for (;;) {
    const [head] = backlog.chunks;

    if (head === undefined) {
      return;
    }

    const written = socket.write(head.subarray(backlog.sent));

    backlog.sent += written;

    if (backlog.sent < head.byteLength) {
      return;
    }

    backlog.chunks.shift();

    backlog.sent = 0;
  }
}
