import type { SendVNCFrame, VNCFrame } from '@heynixie/wire';
import { vncChunkLimitBytes } from '@heynixie/wire';
import { isInputMessage } from './is-input-message';
import type { ConnectVNC, VNCLink } from './types';

export interface VNCRelayOptions {
  readonly connect: ConnectVNC;

  // the most streams open at once
  readonly maxStreams: number;
}

interface RelayStream {
  link: VNCLink | null;
  readonly pending: Uint8Array[];
}

interface RelayContext {
  readonly options: VNCRelayOptions;
  readonly streams: Map<string, RelayStream>;
}

// Pipes each stream that the server opens to a connection to the VNC server, and back. The guest
// never opens a stream. It closes one when its connection closes.
export function makeVNCRelay(
  options: VNCRelayOptions,
): (frame: VNCFrame, send: SendVNCFrame) => void {
  const context: RelayContext = { options, streams: new Map() };

  return (frame, send) => {
    if (frame.kind === 'vnc-open') {
      openStream(context, frame.stream, send);

      return;
    }

    const entry = context.streams.get(frame.stream);

    if (entry === undefined) {
      return;
    }

    if (frame.kind === 'vnc-close') {
      context.streams.delete(frame.stream);
      entry.link?.end();
    } else if (frame.kind === 'vnc-flush') {
      entry.pending.splice(0, entry.pending.length, ...entry.pending.filter(isNotInput));
      entry.link?.flush();
    } else if (entry.link === null) {
      entry.pending.push(frame.data);
    } else {
      entry.link.write(frame.data);
    }
  };
}

function openStream(context: RelayContext, stream: string, send: SendVNCFrame): void {
  const existing = context.streams.get(stream);

  // The server reads the close as the end of the stream with that id, so the open one ends too.
  if (existing !== undefined) {
    context.streams.delete(stream);
    existing.link?.end();
    void sendQuietly(send, { kind: 'vnc-close', stream });

    return;
  }

  if (context.streams.size >= context.options.maxStreams) {
    void sendQuietly(send, { kind: 'vnc-close', stream });

    return;
  }

  const entry: RelayStream = { link: null, pending: [] };

  context.streams.set(stream, entry);
  void connectStream(context, { stream, entry }, send);
}

// The wire closes when the server stops the guest, and then no stream has anyone to tell.
async function sendQuietly(send: SendVNCFrame, frame: VNCFrame): Promise<void> {
  try {
    await send(frame);
  } catch {
    // nothing is left to tell
  }
}

interface OpenedStream {
  readonly stream: string;
  readonly entry: RelayStream;
}

async function connectStream(
  context: RelayContext,
  opened: OpenedStream,
  send: SendVNCFrame,
): Promise<void> {
  try {
    const link = await context.options.connect({
      onData: (bytes) => {
        sendChunks(opened.stream, bytes, send);
      },
      onClose: () => {
        closeStream(context, opened.stream, send);
      },
    });

    if (context.streams.get(opened.stream) !== opened.entry) {
      link.end();

      return;
    }

    opened.entry.link = link;

    for (const bytes of opened.entry.pending.splice(0)) {
      link.write(bytes);
    }
  } catch {
    closeStream(context, opened.stream, send);
  }
}

function sendChunks(stream: string, bytes: Uint8Array, send: SendVNCFrame): void {
  for (let start = 0; start < bytes.byteLength; start += vncChunkLimitBytes) {
    const data = new Uint8Array(bytes.subarray(start, start + vncChunkLimitBytes));

    void sendQuietly(send, { kind: 'vnc-data', stream, data });
  }
}

function closeStream(context: RelayContext, stream: string, send: SendVNCFrame): void {
  if (context.streams.delete(stream)) {
    void sendQuietly(send, { kind: 'vnc-close', stream });
  }
}

function isNotInput(bytes: Uint8Array): boolean {
  return !isInputMessage(bytes);
}
