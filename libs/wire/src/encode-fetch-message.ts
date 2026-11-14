import type { FetchHop, FetchHopPass } from './fetch-hop';
import type { FetchReply } from './fetch-reply';
import type { FetchRequest } from './fetch-request';

const encoder = new TextEncoder();

export function encodeFetchMessage(
  message: FetchRequest | FetchReply | FetchHop | FetchHopPass,
): Uint8Array<ArrayBuffer> {
  if ('kind' in message) {
    return encoder.encode(JSON.stringify(message));
  }

  if (message.hops === 'none') {
    return encoder.encode(
      JSON.stringify({
        url: message.url,
        limits: message.limits,
        deniedRanges: message.deniedRanges,
      }),
    );
  }

  return encoder.encode(
    JSON.stringify({
      url: message.url,
      limits: { ...message.limits, redirects: 0 },
      deniedRanges: message.deniedRanges,
      hopGate: { redirects: message.limits.redirects },
    }),
  );
}
