import { decodeFetchReply } from './decode-fetch-reply';
import type { FetchGuestFrame } from './fetch-guest-frame';
import { parseFetchObject } from './parse-fetch-object';

export function decodeFetchGuestFrame(bytes: Uint8Array): FetchGuestFrame {
  const frame = parseFetchObject(bytes, 'reply');

  if (frame['kind'] !== 'hop') {
    return decodeFetchReply(bytes);
  }

  if (typeof frame['url'] !== 'string') {
    throw new TypeError('a fetch hop needs a url string');
  }

  return { kind: 'hop', url: frame['url'] };
}
