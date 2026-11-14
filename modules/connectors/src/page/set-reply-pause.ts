import type { FetchReply } from '@heynixie/wire';
import { readFetchHost } from '../fetch/read-fetch-host';
import type { PageFetch } from './page-fetch';

type StatusReply = Extract<FetchReply, { readonly kind: 'page' | 'image' }>;

// A rate limit pauses the host of the final URL, and the host of the sent URL after a redirect.
export function setReplyPause(fetching: PageFetch, sentURL: string, reply: StatusReply): void {
  const isBlocked = reply.kind === 'page' && reply.blocked !== null;
  const asksForPause = reply.status === 429 || reply.status === 503 || reply.retryAfterMs !== null;

  if (isBlocked || !asksForPause) {
    return;
  }

  const replyHost = readFetchHost(reply.url);
  const sentHost = readFetchHost(sentURL);

  fetching.backoff.setPause(replyHost, reply.retryAfterMs);

  if (sentHost !== replyHost) {
    fetching.backoff.setPause(sentHost, reply.retryAfterMs);
  }
}
