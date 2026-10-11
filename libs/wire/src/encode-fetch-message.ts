import type { FetchReply } from './fetch-reply';
import type { FetchRequest } from './fetch-request';

const encoder = new TextEncoder();

// Encodes a fetch request or reply as one line of JSON, the payload of one frame.
export function encodeFetchMessage(message: FetchRequest | FetchReply): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}
