import type { FetchReply } from '@heynixie/wire';

// A page or image reply with no blocked reason is a rate limit at status 429 or 503, or at 403 when
// its headers ask for a wait. An image reply carries no blocked reason.
export function isRateLimitReply(reply: FetchReply): boolean {
  if (reply.kind !== 'page' && reply.kind !== 'image') {
    return false;
  }

  if (reply.kind === 'page' && reply.blocked !== null) {
    return false;
  }

  return (
    reply.status === 429 ||
    reply.status === 503 ||
    (reply.status === 403 && reply.retryAfterMs !== null)
  );
}
