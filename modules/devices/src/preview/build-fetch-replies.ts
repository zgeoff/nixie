import type { PageFetchReply } from '@heynixie/wire';
import type { HeldResult } from '../stream/create-page-fetches';

// What each page region's fetches returned, as a preview frame holds it: the response, or the
// refusal. A fetch that returned nothing yet has no entry, so the page's nixie.data answers
// NOT_READY as the device page does.
export function buildFetchReplies(
  results: readonly HeldResult[],
): ReadonlyMap<string, Readonly<Record<string, PageFetchReply>>> {
  const replies = new Map<string, Record<string, PageFetchReply>>();

  for (const held of results) {
    const region = replies.get(held.region) ?? {};

    region[held.url] =
      held.result.kind === 'body'
        ? {
            status: held.result.status,
            type: held.result.type,
            body: held.result.body,
            fetchedAt: new Date(held.result.fetchedAtMs).toISOString(),
          }
        : { error: 'REFUSED' };

    replies.set(held.region, region);
  }

  return replies;
}
