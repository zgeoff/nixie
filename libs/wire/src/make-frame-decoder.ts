import { frameHeaderBytes } from './frame-header-bytes';
import { FrameTooLargeError } from './frame-too-large-error';

// Takes chunks of a frame stream as they arrive and returns each message they complete.
export type FrameDecoder = (chunk: Uint8Array) => readonly Uint8Array<ArrayBuffer>[];

// Makes a decoder for the frames encodeFrame writes. It throws FrameTooLargeError at the header of a
// frame whose payload passes maxMessageBytes, so a sender cannot make the reader hold more.
export function makeFrameDecoder(maxMessageBytes: number): FrameDecoder {
  const buffer = { pending: new Uint8Array(0) };

  return (chunk) => {
    buffer.pending = mergeBytes(buffer.pending, chunk);

    const messages: Uint8Array<ArrayBuffer>[] = [];

    for (
      let message = splitFrame(buffer, maxMessageBytes);
      message !== null;
      message = splitFrame(buffer, maxMessageBytes)
    ) {
      messages.push(message);
    }
    return messages;
  };
}

function mergeBytes(head: Uint8Array, tail: Uint8Array): Uint8Array<ArrayBuffer> {
  const merged = new Uint8Array(head.byteLength + tail.byteLength);

  merged.set(head);
  merged.set(tail, head.byteLength);
  return merged;
}

interface FrameBuffer {
  pending: Uint8Array<ArrayBuffer>;
}

// takes the first whole frame off the buffer, or returns null while the frame is still partial
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the decoder's own buffer
function splitFrame(buffer: FrameBuffer, maxMessageBytes: number): Uint8Array<ArrayBuffer> | null {
  if (buffer.pending.byteLength < frameHeaderBytes) {
    return null;
  }
  const size = new DataView(buffer.pending.buffer).getUint32(0);

  if (size > maxMessageBytes) {
    throw new FrameTooLargeError(size, maxMessageBytes);
  }
  if (buffer.pending.byteLength < frameHeaderBytes + size) {
    return null;
  }
  const message = buffer.pending.slice(frameHeaderBytes, frameHeaderBytes + size);

  buffer.pending = buffer.pending.slice(frameHeaderBytes + size);
  return message;
}
