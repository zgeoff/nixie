import type { FetchHop, FetchHopPass } from '../utils/fetch-hop';
import type { FetchReply } from '../utils/fetch-reply';
import type { FetchRequest } from './fetch-request';

const encoder = new TextEncoder();

export function encodeFetchMessage(
  message: FetchRequest | FetchReply | FetchHop | FetchHopPass,
): Uint8Array<ArrayBuffer> {
  if ('kind' in message) {
    return encoder.encode(JSON.stringify(message));
  }

  const html = {
    ...(message.html === undefined ? {} : { html: message.html }),
    ...(message.mode === undefined ? {} : { mode: message.mode }),
  };

  if (message.hops === 'none') {
    return encoder.encode(
      JSON.stringify({
        url: message.url,
        limits: message.limits,
        deniedRanges: message.deniedRanges,
        ...html,
      }),
    );
  }

  return encoder.encode(
    JSON.stringify({
      url: message.url,
      limits: { ...message.limits, redirects: 0 },
      deniedRanges: message.deniedRanges,
      hopGate: { redirects: message.limits.redirects },
      ...html,
    }),
  );
}
