import { z } from 'zod';
import { parseJSONOrNull } from '../utils/parse-json-or-null';
import type { VNCFrame } from './vnc-frame';
import { vncChunkLimitBytes } from './vnc-frame';

const decoder = new TextDecoder();
const kindPrefix = new TextEncoder().encode('{"kind":"vnc-');

const streamSchema = z.string().min(1).max(64);

const vncFrameSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('vnc-open'), stream: streamSchema }),
  z.strictObject({ kind: z.literal('vnc-data'), stream: streamSchema, data: z.base64() }),
  z.strictObject({ kind: z.literal('vnc-close'), stream: streamSchema }),
]);

// The frame in the bytes, or null when the bytes hold no VNC frame, such as a request or a reply, or
// hold a malformed one, or one whose data passes the chunk limit.
export function decodeVNCFrame(bytes: Uint8Array): VNCFrame | null {
  if (!kindPrefix.every((byte, index) => bytes[index] === byte)) {
    return null;
  }

  const parsed = vncFrameSchema.safeParse(parseJSONOrNull(decoder.decode(bytes)));

  if (!parsed.success) {
    return null;
  }

  const frame = parsed.data;

  if (frame.kind !== 'vnc-data') {
    return frame;
  }

  const data = new Uint8Array(Buffer.from(frame.data, 'base64'));

  return data.byteLength > vncChunkLimitBytes
    ? null
    : { kind: 'vnc-data', stream: frame.stream, data };
}
