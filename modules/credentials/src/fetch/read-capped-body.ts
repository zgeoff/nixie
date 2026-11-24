import type { IncomingMessage } from 'node:http';
import type { ZlibOptions } from 'node:zlib';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { CredentialRefusalError } from '@heynixie/egress';

// The fetcher buffers a body to remove a value from it, so a larger body is refused.
export const bodyBufferCapBytes = 32 * 1024 * 1024;
export const bodyTooLargeMessage = 'the response is larger than the 32 MiB the fetcher buffers';

export async function readCappedBody(response: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of response) {
    const piece = Buffer.from(chunk);

    total += piece.byteLength;

    if (total > bodyBufferCapBytes) {
      response.destroy();
      throw new CredentialRefusalError(bodyTooLargeMessage);
    }

    chunks.push(piece);
  }

  return decodeBody(Buffer.concat(chunks), response.headers['content-encoding']);
}

// The decoder stops at the cap, so a small compressed body never allocates what it expands to.
function decodeBody(body: Buffer, encoding: string | undefined): Uint8Array {
  const name = encoding?.trim().toLowerCase();
  const limit: ZlibOptions = { maxOutputLength: bodyBufferCapBytes };

  try {
    if (name === 'gzip' || name === 'x-gzip') {
      return gunzipSync(body, limit);
    }

    if (name === 'br') {
      return brotliDecompressSync(body, limit);
    }

    return name === 'deflate' ? inflateSync(body, limit) : body;
  } catch (error) {
    if (error instanceof RangeError && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new CredentialRefusalError(bodyTooLargeMessage);
    }

    throw error;
  }
}
