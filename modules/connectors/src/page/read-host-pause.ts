import { readFetchHost } from '../fetch/read-fetch-host';
import type { PageFetch } from './page-fetch';
import type { PassOutcome } from './read-fetch-pass';

type PausedOutcome = Extract<PassOutcome, { readonly kind: 'paused' }>;

// Waits out a short pause before the call enters the fetch queue, and returns a long one.
export async function readHostPause(
  fetching: PageFetch,
  url: string,
): Promise<PausedOutcome | null> {
  const host = readFetchHost(url);
  const leftMs = fetching.backoff.readPause(host);

  if (leftMs > fetching.backoffWaitMs) {
    return { kind: 'paused', host, leftMs };
  }

  if (leftMs > 0) {
    await fetching.clock.sleep(leftMs);
  }

  return null;
}
