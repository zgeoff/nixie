import type { Log } from '@heynixie/log';
import { findPlace, parsePlace, readPlaces } from '@heynixie/policy';

// Finds the short ID of the place you blocked that covers a URL's host, for a fetch that no
// decision point sees, such as each redirect hop of a page.
export function makeBlockedPlaceFinder(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): (url: string) => Promise<string | null> {
  return async (url) => {
    const parsed = URL.parse(url);

    if (parsed === null) {
      return null;
    }

    const host = parsed.hostname;

    const places = await readPlaces(log);

    const found = findPlace(places, { parsed: parsePlace(host), raw: host });

    return found?.trust === 'blocked' ? found.shortID : null;
  };
}
