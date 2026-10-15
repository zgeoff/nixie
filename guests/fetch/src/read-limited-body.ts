import type { Readable } from 'node:stream';

export interface LimitedBody {
  readonly bytes: Uint8Array;

  // the body went on past the limit, and the reader stopped there
  readonly isTruncated: boolean;
}

// Reads a body up to limit bytes, and stops reading at the limit.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a node stream has no readonly form
export async function readLimitedBody(body: Readable, limit: number): Promise<LimitedBody> {
  const chunks: Uint8Array[] = [];
  const read = { bytes: 0 };

  for await (const chunk of body) {
    const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk));

    chunks.push(bytes.subarray(0, limit - read.bytes));

    read.bytes += bytes.byteLength;

    if (read.bytes > limit) {
      body.destroy();

      return { bytes: Buffer.concat(chunks), isTruncated: true };
    }
  }

  return { bytes: Buffer.concat(chunks), isTruncated: false };
}
