import type { VNCLink, VNCLinkEvents } from './types';

// Connects to the VNC server on the loopback of the sandbox. The server's own `-localhost` flag
// refuses every other address, so no other path reaches it.
export async function connectVNC(port: number, events: VNCLinkEvents): Promise<VNCLink> {
  const backlog: { bytes: Uint8Array | null } = { bytes: null };

  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port,
    socket: {
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
