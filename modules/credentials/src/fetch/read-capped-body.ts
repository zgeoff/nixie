import type { IncomingMessage } from 'node:http';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { CredentialRefusalError } from '@heynixie/egress';

// The fetcher buffers a body to remove a value from it, so a larger body is refused.
export const bodyBufferCapBytes = 32 * 1024 * 1024;

export async function readCappedBody(response: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of response) {
    const piece = Buffer.from(chunk);

    total += piece.byteLength;

    if (total > bodyBufferCapBytes) {
      response.destroy();

      throw new CredentialRefusalError(
        'the response is larger than the 32 MiB the fetcher buffers',
      );
    }

    chunks.push(piece);
  }

  const decoded = decodeBody(Buffer.concat(chunks), response.headers['content-encoding']);

  if (decoded.byteLength > bodyBufferCapBytes) {
    throw new CredentialRefusalError('the response is larger than the 32 MiB the fetcher buffers');
  }

  return decoded;
}

function decodeBody(body: Buffer, encoding: string | undefined): Uint8Array {
  const name = encoding?.trim().toLowerCase();

  if (name === 'gzip' || name === 'x-gzip') {
    return gunzipSync(body);
  }

  if (name === 'br') {
    return brotliDecompressSync(body);
  }

  return name === 'deflate' ? inflateSync(body) : body;
}
