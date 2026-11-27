import type { PageFetch } from './page-fetch';

// The refusal sentence for a URL that a blocked place covers, or null. A hop that reaches a blocked
// site ends the fetch the same way as the first URL.
export async function refuseBlockedPlace(
  fetching: Pick<PageFetch, 'findBlockedPlace'>,
  url: string,
): Promise<string | null> {
  const shortID = await fetching.findBlockedPlace?.(url);

  return shortID === undefined || shortID === null
    ? null
    : `the site is a place you blocked (${shortID}), so it was not fetched`;
}
