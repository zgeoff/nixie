import type { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

// The body limit counts decoded bytes, so a small compressed body cannot expand past it.
export function decodeContent(body: Readable, contentEncoding: string | undefined): Readable {
  const coding = (contentEncoding ?? 'identity').trim().toLowerCase();

  if (coding === 'identity') {
    return body;
  }

  const decoders = new Map<string, () => Transform>([
    ['gzip', createGunzip],
    ['x-gzip', createGunzip],
    ['deflate', createInflate],
    ['br', createBrotliDecompress],
  ]);

  const createDecoder = decoders.get(coding);

  if (createDecoder === undefined) {
    throw new Error(`the page uses the content coding ${coding}, which the fetcher cannot read`);
  }

  // pipeline, unlike pipe, passes an abort on the body to the decoder, so a time limit ends a
  // stalled body.
  return pipeline(body, createDecoder(), () => {});
}
