import { spyOn } from 'bun:test';
import { encodeFrame } from '../encode-frame';
import { makeFrameDecoder } from '../make-frame-decoder';

export interface ChunkedDecodeCopies {
  readonly messages: readonly Uint8Array<ArrayBuffer>[];
  readonly copiedBytes: number;
}

// A count of the bytes copied, not the time, so a garbage collection or a slow runner cannot fail
// the check.
export function countChunkedDecodeCopies(
  message: Uint8Array,
  chunkBytes: number,
): ChunkedDecodeCopies {
  const stream = encodeFrame(message);

  const chunks = Array.from({ length: Math.ceil(stream.byteLength / chunkBytes) }, (_, index) =>
    stream.subarray(index * chunkBytes, (index + 1) * chunkBytes),
  );

  const decode = makeFrameDecoder(message.byteLength);
  const copies = spyOn(Uint8Array.prototype, 'set');

  try {
    const messages = chunks.flatMap((chunk) => decode(chunk));

    const copiedBytes = copies.mock.calls.reduce(
      (total, [source]) => total + (source instanceof Uint8Array ? source.byteLength : 0),
      0,
    );

    return { messages, copiedBytes };
  } finally {
    copies.mockRestore();
  }
}
