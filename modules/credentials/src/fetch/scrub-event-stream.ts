import type { ValueForm } from '@heynixie/egress';
import { CredentialRefusalError, scrubBytes } from '@heynixie/egress';

// One event of a stream is read whole before it goes on, so a value never straddles the cut.
export const eventBufferCapBytes = 1024 * 1024;

// Removes the value from a server-sent event stream one event at a time: a chunk is held until the
// blank line that ends its event arrives, scrubbed, and passed on. An event past the cap is refused.
export function scrubEventStream(
  body: ReadableStream<Uint8Array>,
  forms: readonly ValueForm[],
): ReadableStream<Uint8Array> {
  const held: { bytes: Buffer } = { bytes: Buffer.alloc(0) };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        held.bytes = Buffer.concat([held.bytes, chunk]);

        const end = getLastEventEnd(held.bytes);

        if (end > 0) {
          controller.enqueue(scrubBytes(held.bytes.subarray(0, end), forms));

          held.bytes = held.bytes.subarray(end);
        }

        if (held.bytes.byteLength > eventBufferCapBytes) {
          throw new CredentialRefusalError(
            'an event of the stream is larger than the fetcher holds',
          );
        }
      },
      flush: (controller) => {
        if (held.bytes.byteLength > 0) {
          controller.enqueue(scrubBytes(held.bytes, forms));
        }
      },
    }),
  );
}

// The index just past the last blank line, or 0 when the bytes hold no whole event.
function getLastEventEnd(bytes: Buffer): number {
  const lf = bytes.lastIndexOf('\n\n');
  const crlf = bytes.lastIndexOf('\r\n\r\n');
  const lfEnd = lf === -1 ? 0 : lf + 2;
  const crlfEnd = crlf === -1 ? 0 : crlf + 4;

  return Math.max(lfEnd, crlfEnd);
}
