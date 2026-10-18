import type { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const decoders = new Map<string, () => Transform>([
  ['gzip', createGunzip],
  ['x-gzip', createGunzip],
  ['deflate', createInflate],
  ['br', createBrotliDecompress],
]);

// The body after its content coding, so the body limit counts decoded bytes and a small compressed
// body cannot expand past it. It throws for a coding the fetcher cannot read. pipeline, unlike
// pipe, passes an abort on the body to the decoder, so the time limit ends a stalled body.
export function decodeContent(body: Readable, contentEncoding: string | undefined): Readable {
  const coding = (contentEncoding ?? 'identity').trim().toLowerCase();

  if (coding === 'identity') {
    return body;
  }

  const createDecoder = decoders.get(coding);

  if (createDecoder === undefined) {
    throw new Error(`the page uses the content coding ${coding}, which the fetcher cannot read`);
  }

  return pipeline(body, createDecoder(), () => {
    // the reader sees the error on the decoder, which pipeline destroys with it
  });
}
