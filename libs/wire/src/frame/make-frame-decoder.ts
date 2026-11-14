import { frameHeaderBytes } from './frame-header-bytes';
import { FrameTooLargeError } from './frame-too-large-error';

export type FrameDecoder = (chunk: Uint8Array) => readonly Uint8Array<ArrayBuffer>[];

interface PartialFrame {
  header: Uint8Array<ArrayBuffer>;
  headerBytes: number;
  message: Uint8Array<ArrayBuffer> | null;
  messageBytes: number;
}

export function makeFrameDecoder(maxMessageBytes: number): FrameDecoder {
  const frame: PartialFrame = {
    header: new Uint8Array(frameHeaderBytes),
    headerBytes: 0,
    message: null,
    messageBytes: 0,
  };

  return (chunk) => {
    const messages: Uint8Array<ArrayBuffer>[] = [];

    for (let offset = 0; offset < chunk.byteLength;) {
      offset =
        frame.message === null
          ? copyHeaderBytes(frame, chunk, offset, maxMessageBytes)
          : copyMessageBytes(frame, frame.message, chunk, offset);

      if (frame.message !== null && frame.messageBytes === frame.message.byteLength) {
        messages.push(frame.message);

        frame.headerBytes = 0;
        frame.message = null;
        frame.messageBytes = 0;
      }
    }

    return messages;
  };
}

function copyHeaderBytes(
  frame: PartialFrame,
  chunk: Uint8Array,
  offset: number,
  maxMessageBytes: number,
): number {
  const end = Math.min(offset + frameHeaderBytes - frame.headerBytes, chunk.byteLength);

  frame.header.set(chunk.subarray(offset, end), frame.headerBytes);

  frame.headerBytes += end - offset;

  if (frame.headerBytes === frameHeaderBytes) {
    const size = new DataView(frame.header.buffer).getUint32(0);

    if (size > maxMessageBytes) {
      throw new FrameTooLargeError(size, maxMessageBytes);
    }

    frame.message = new Uint8Array(size);
  }

  return end;
}

function copyMessageBytes(
  frame: PartialFrame,
  message: Uint8Array<ArrayBuffer>,
  chunk: Uint8Array,
  offset: number,
): number {
  const end = Math.min(offset + message.byteLength - frame.messageBytes, chunk.byteLength);

  message.set(chunk.subarray(offset, end), frame.messageBytes);

  frame.messageBytes += end - offset;

  return end;
}
