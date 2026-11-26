import type { ValueForm } from '@heynixie/egress';
import { CredentialRefusalError, scrubBytes } from '@heynixie/egress';

// Removes the value from a server-sent event stream one event at a time: a chunk is held until the
// blank line that ends its event arrives, scrubbed, and passed on. An event past the cap is refused,
// whether it arrives in one chunk or in many.
export function scrubEventStream(
  body: ReadableStream<Uint8Array>,
  forms: readonly ValueForm[],
): ReadableStream<Uint8Array> {
  const held: { bytes: Buffer } = { bytes: Buffer.alloc(0) };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        held.bytes = Buffer.concat([held.bytes, chunk]);

        let start = 0;

        for (const end of collectEventEnds(held.bytes)) {
          requireWithinCap(end - start);

          controller.enqueue(scrubBytes(held.bytes.subarray(start, end), forms));

          start = end;
        }

        held.bytes = held.bytes.subarray(start);

        requireWithinCap(held.bytes.byteLength);
      },
      flush: (controller) => {
        if (held.bytes.byteLength > 0) {
          controller.enqueue(scrubBytes(held.bytes, forms));
        }
      },
    }),
  );
}

// The index just past each blank line, in order. A blank line ends with two line feeds or with two
// carriage-return and line-feed pairs.
function collectEventEnds(bytes: Buffer): number[] {
  const ends: number[] = [];
  let from = 0;

  for (;;) {
    const lf = bytes.indexOf('\n\n', from);
    const crlf = bytes.indexOf('\r\n\r\n', from);

    const found = [lf === -1 ? null : lf + 2, crlf === -1 ? null : crlf + 4].filter(
      (end) => end !== null,
    );

    if (found.length === 0) {
      return ends;
    }

    const end = Math.min(...found);

    ends.push(end);

    from = end;
  }
}

// One event of a stream is read whole before it goes on, so a value never straddles the cut. An
// event counts with its terminating blank line.
export const eventBufferCapBytes = 1024 * 1024;

function requireWithinCap(byteLength: number): void {
  if (byteLength > eventBufferCapBytes) {
    throw new CredentialRefusalError('an event of the stream is larger than the fetcher holds');
  }
}
