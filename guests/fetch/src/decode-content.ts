import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

// The body after its content coding, so the body limit counts decoded bytes and a small compressed
// body cannot expand past it. It throws for a coding the fetcher cannot read.
export function decodeContent(body: Readable, contentEncoding: string | undefined): Readable {
  const coding = (contentEncoding ?? 'identity').trim().toLowerCase();

  switch (coding) {
    case 'identity': {
      return body;
    }
    case 'gzip':
    case 'x-gzip': {
      return body.pipe(createGunzip());
    }
    case 'deflate': {
      return body.pipe(createInflate());
    }
    case 'br': {
      return body.pipe(createBrotliDecompress());
    }
    default: {
      throw new Error(`the page uses the content coding ${coding}, which the fetcher cannot read`);
    }
  }
}
