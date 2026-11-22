import type { VNCLink, VNCLinkEvents } from './types';

export interface VNCTarget {
  // the Unix socket of the VNC server
  readonly path: string;

  // how long a refused connection is tried again, for a VNC server that has not started listening
  readonly waitMs: number;
}

// Connects to the VNC server on its Unix socket. The server listens on no TCP port, and the socket's
// folder is closed to every account but the server's and the guest's, so no other path reaches it.
export async function connectVNC(target: VNCTarget, events: VNCLinkEvents): Promise<VNCLink> {
  const backlog: { bytes: Uint8Array | null } = { bytes: null };

  const socket = await connectWhenListening(target, {
    data: (_socket, data) => {
      events.onData(new Uint8Array(data));
    },
    drain: (open) => {
      backlog.bytes = flushBacklog(open, backlog.bytes);
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
      const queued = backlog.bytes === null ? bytes : concat(backlog.bytes, bytes);

      backlog.bytes = flushBacklog(socket, queued);
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

function flushBacklog(socket: WritableSocket, bytes: Uint8Array | null): Uint8Array | null {
  if (bytes === null) {
    return null;
  }

  const written = socket.write(bytes);

  return written < bytes.byteLength ? bytes.subarray(written) : null;
}

function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
  const joined = new Uint8Array(first.byteLength + second.byteLength);

  joined.set(first);
  joined.set(second, first.byteLength);

  return joined;
}
