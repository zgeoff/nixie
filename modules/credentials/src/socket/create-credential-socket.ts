import type { ValueForm } from '@heynixie/egress';
import { scrubText } from '@heynixie/egress';
import type { CredentialSocket } from '../types';
import type { FrameOpcode } from './encode-client-frame';
import { encodeClientFrame } from './encode-client-frame';
import { makeFrameReader } from './make-frame-reader';
import type { UpgradedConnection } from './send-pinned-upgrade';

const defaultMaxMessageBytes = 16 * 1024 * 1024;

interface Inbox {
  readonly texts: string[];
  readonly waiters: ((text: string | null) => void)[];
  isEnded: boolean;
}

// Reads text messages from an upgraded connection, answers its pings, and ends the stream when the
// server closes, the connection drops, or one message, frames together, grows past the limit.
export function createCredentialSocket(
  connection: UpgradedConnection,
  forms: readonly ValueForm[],
  maxMessageBytes = defaultMaxMessageBytes,
): CredentialSocket {
  const socket = connection.socket;
  const inbox: Inbox = { texts: [], waiters: [], isEnded: false };
  const readFrames = makeFrameReader(maxMessageBytes);
  let fragments: Buffer[] = [];
  let fragmentBytes = 0;

  const end = (): void => {
    inbox.isEnded = true;

    for (const waiter of inbox.waiters.splice(0)) {
      waiter(null);
    }

    socket.destroy();
  };

  const write = (opcode: FrameOpcode, payload: Uint8Array): void => {
    if (!socket.destroyed && socket.writable) {
      socket.write(encodeClientFrame(opcode, payload));
    }
  };

  const push = (text: string): void => {
    const waiter = inbox.waiters.shift();

    if (waiter === undefined) {
      inbox.texts.push(text);
    } else {
      waiter(text);
    }
  };

  const take = (chunk: Uint8Array): void => {
    for (const frame of readFrames(chunk)) {
      if (frame.opcode === 0x9) {
        write(0xa, frame.payload);
      } else if (frame.opcode === 0x8) {
        write(0x8, frame.payload.subarray(0, 2));
        end();

        return;
      } else if (frame.opcode === 0x1 || frame.opcode === 0x0) {
        fragmentBytes += frame.payload.length;

        if (fragmentBytes > maxMessageBytes) {
          throw new Error(`the server sent a message past ${String(maxMessageBytes)} bytes`);
        }

        fragments.push(frame.payload);

        if (frame.isFinal) {
          push(scrubText(Buffer.concat(fragments).toString('utf8'), forms));

          fragments = [];
          fragmentBytes = 0;
        }
      }
    }
  };

  socket.on('data', (chunk: Buffer) => {
    try {
      take(chunk);
    } catch {
      end();
    }
  });

  socket.on('close', end);
  socket.on('error', end);

  if (connection.head.length > 0) {
    take(connection.head);
  }

  return {
    send: (text) => {
      if (inbox.isEnded) {
        throw new Error('the socket is closed');
      }

      write(0x1, Buffer.from(text, 'utf8'));
    },
    messages: streamMessages(inbox),
    close: () => {
      if (!inbox.isEnded) {
        write(0x8, Buffer.from([0x03, 0xe8]));
      }

      end();
    },
  };
}

async function* streamMessages(inbox: Inbox): AsyncGenerator<string> {
  for (;;) {
    const queued = inbox.texts.shift();

    if (queued !== undefined) {
      yield queued;
      continue;
    }

    if (inbox.isEnded) {
      return;
    }

    const next = await new Promise<string | null>((resolve) => {
      inbox.waiters.push(resolve);
    });

    if (next === null) {
      return;
    }

    yield next;
  }
}
