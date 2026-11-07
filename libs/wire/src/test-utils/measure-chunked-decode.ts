import { encodeFrame } from '../encode-frame';
import { makeFrameDecoder } from '../make-frame-decoder';

export interface ChunkedDecode {
  messages: readonly Uint8Array<ArrayBuffer>[];
  nsPerByte: number;
}

export function measureChunkedDecode(message: Uint8Array, chunkBytes: number): ChunkedDecode {
  const stream = encodeFrame(message);

  const chunks = Array.from({ length: Math.ceil(stream.byteLength / chunkBytes) }, (_, index) =>
    stream.subarray(index * chunkBytes, (index + 1) * chunkBytes),
  );

  const decode = makeFrameDecoder(message.byteLength);
  const startedMs = performance.now();
  const messages = chunks.flatMap((chunk) => decode(chunk));

  return { messages, nsPerByte: ((performance.now() - startedMs) * 1e6) / message.byteLength };
}
