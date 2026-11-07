import { spyOn } from 'bun:test';
import invariant from 'tiny-invariant';
import { encodeFrame } from '../encode-frame';
import { makeFrameDecoder } from '../make-frame-decoder';

export interface ChunkedDecodeBytes {
  readonly messages: readonly Uint8Array<ArrayBuffer>[];
  readonly allocatedBytes: number;
  readonly copiedBytes: number;
}

interface Counted {
  allocatedBytes: number;
}

// Counts bytes, not time, so a garbage collection or a slow runner cannot fail the check. A decoder
// that grows its buffer per chunk shows in one count or the other, whether it copies with `set`,
// `slice` or `Uint8Array.from`.
export function countChunkedDecodeBytes(
  message: Uint8Array,
  chunkBytes: number,
): ChunkedDecodeBytes {
  const stream = encodeFrame(message);

  const chunks = Array.from({ length: Math.ceil(stream.byteLength / chunkBytes) }, (_, index) =>
    stream.subarray(index * chunkBytes, (index + 1) * chunkBytes),
  );

  const decode = makeFrameDecoder(message.byteLength);
  const counted: Counted = { allocatedBytes: 0 };
  const original = globalThis.Uint8Array;

  globalThis.Uint8Array = new Proxy(original, {
    construct: (target, args: unknown[]) => {
      const created: unknown = Reflect.construct(target, args, target);

      invariant(created instanceof original);

      counted.allocatedBytes += created.byteLength;

      return created;
    },
    get: (target, key, receiver: unknown): unknown =>
      key === 'from' ? makeCountedFrom(target, counted) : Reflect.get(target, key, receiver),
  });

  const sets = spyOn(original.prototype, 'set');
  const slices = spyOn(original.prototype, 'slice');

  try {
    const messages = chunks.flatMap((chunk) => decode(chunk));

    const copiedBytes = sets.mock.calls.reduce(
      (total, [source]) => total + (source instanceof original ? source.byteLength : 0),
      0,
    );

    const slicedBytes = slices.mock.results.reduce(
      (total, result) => total + (result.value instanceof original ? result.value.byteLength : 0),
      0,
    );

    return { messages, allocatedBytes: counted.allocatedBytes + slicedBytes, copiedBytes };
  } finally {
    globalThis.Uint8Array = original;

    sets.mockRestore();
    slices.mockRestore();
  }
}

function makeCountedFrom(
  target: Uint8ArrayConstructor,
  counted: Counted,
): (source: ArrayLike<number>) => Uint8Array<ArrayBuffer> {
  return (source) => {
    const created = target.from(source);

    counted.allocatedBytes += created.byteLength;

    return created;
  };
}
