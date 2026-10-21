import type { FetchReply } from './fetch-reply';
import type { FetchRequest } from './fetch-request';

const encoder = new TextEncoder();

export function encodeFetchMessage(message: FetchRequest | FetchReply): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}
