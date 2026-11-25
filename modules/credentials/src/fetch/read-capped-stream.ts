import { CredentialRefusalError } from '@heynixie/egress';
import { bodyBufferCapBytes, bodyTooLargeMessage } from './read-capped-body';

// A decoded body that a test build's transport hands back, read up to the same cap.
export async function readCappedStream(
  body: ReadableStream<Uint8Array> | null,
): Promise<Uint8Array> {
  if (body === null) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of body) {
    total += chunk.byteLength;

    if (total > bodyBufferCapBytes) {
      throw new CredentialRefusalError(bodyTooLargeMessage);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
