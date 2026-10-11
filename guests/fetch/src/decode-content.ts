import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

// The body after its content coding, so the body limit counts decoded bytes and a small compressed
// body cannot expand past it. It throws for a coding the fetcher cannot read. pipeline, unlike
// pipe, passes an abort on the body to the decoder, so the time limit ends a stalled body.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a node stream has no readonly form
export function decodeContent(body: Readable, contentEncoding: string | undefined): Readable {
  const coding = (contentEncoding ?? 'identity').trim().toLowerCase();

  switch (coding) {
    case 'identity': {
      return body;
    }
    case 'gzip':
    case 'x-gzip': {
      return pipeline(body, createGunzip(), () => {
        // the reader sees the error on the decoder, which pipeline destroys with it
      });
    }
    case 'deflate': {
      return pipeline(body, createInflate(), () => {
        // the reader sees the error on the decoder, which pipeline destroys with it
      });
    }
    case 'br': {
      return pipeline(body, createBrotliDecompress(), () => {
        // the reader sees the error on the decoder, which pipeline destroys with it
      });
    }
    default: {
      throw new Error(`the page uses the content coding ${coding}, which the fetcher cannot read`);
    }
  }
}
