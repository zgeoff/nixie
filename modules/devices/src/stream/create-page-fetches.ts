// What one declared fetch last returned, as a page's nixie.data reads it.
export type FetchResult =
  | {
      readonly kind: 'body';
      readonly status: number;
      readonly type: string;
      readonly body: string;
      readonly fetchedAtMs: number;
    }
  | { readonly kind: 'refused'; readonly reason: string };

export type FetchRead =
  | { readonly status: 'stale' }
  | { readonly status: 'not_declared' }
  | { readonly status: 'pending' }
  | { readonly status: 'done'; readonly result: FetchResult };

export interface DeclaredFetch {
  readonly url: string;
  readonly refreshMinutes: number | undefined;
}

// the region of a device that declares fetches
export interface RegionKey {
  readonly deviceID: string;
  readonly region: string;
}

// one declared fetch of the content a region shows
export interface FetchKey extends RegionKey {
  readonly shown: string;
  readonly url: string;
}

export interface HeldFetches {
  readonly shown: string;
  readonly fetches: readonly DeclaredFetch[];
  readonly isCovered: boolean;
}

export interface HeldResult {
  readonly region: string;
  readonly shown: string;
  readonly url: string;
  readonly result: FetchResult;
}

export interface PageFetches {
  // Holds the fetches that the content of a region declares, and drops what the content before it
  // held. A held declaration is covered when the call that showed the content decided its hosts.
  readonly declare: (key: RegionKey, held: HeldFetches) => void;

  // Keeps what a declared fetch returned. A fetch of content the region no longer shows is dropped.
  readonly record: (key: FetchKey, result: FetchResult) => void;

  // what a page asked for: stale for content the region no longer shows, and not declared for a
  // URL the content did not name
  readonly read: (key: FetchKey) => FetchRead;

  // The declaration of a region, or null when it holds none.
  readonly readHeld: (deviceID: string, region: string) => HeldFetches | null;

  // The last result of each declared fetch of the regions whose current content is the one named.
  readonly readAll: (
    deviceID: string,
    current: ReadonlyMap<string, string>,
  ) => readonly HeldResult[];

  // forgets the declaration of a region, because its content changed
  readonly remove: (deviceID: string, region: string) => void;
}

interface HeldRegion extends HeldFetches {
  readonly results: Map<string, FetchResult>;
}

// The fetches that the pages of a device declare and what they returned, in memory only: a
// restart drops them, and the fetches run again.
export function createPageFetches(): PageFetches {
  const held = new Map<string, Map<string, HeldRegion>>();

  const find = (deviceID: string, region: string): HeldRegion | undefined =>
    held.get(deviceID)?.get(region);

  return {
    declare: (key, declared) => {
      const regions = held.get(key.deviceID) ?? new Map<string, HeldRegion>();

      regions.set(key.region, { ...declared, results: new Map() });
      held.set(key.deviceID, regions);
    },
    record: (key, result) => {
      const entry = find(key.deviceID, key.region);

      if (entry?.shown === key.shown && entry.fetches.some((fetch) => fetch.url === key.url)) {
        entry.results.set(key.url, result);
      }
    },
    read: (key) => {
      const entry = find(key.deviceID, key.region);
      const url = key.url;

      if (entry?.shown !== key.shown) {
        return { status: 'stale' };
      }

      if (!entry.fetches.some((fetch) => fetch.url === url)) {
        return { status: 'not_declared' };
      }

      const result = entry.results.get(url);

      return result === undefined ? { status: 'pending' } : { status: 'done', result };
    },
    readHeld: (deviceID, region) => find(deviceID, region) ?? null,
    readAll: (deviceID, current) =>
      [...(held.get(deviceID)?.entries() ?? [])].flatMap(([region, entry]) =>
        current.get(region) === entry.shown
          ? [...entry.results].map(([url, result]) => ({
              region,
              shown: entry.shown,
              url,
              result,
            }))
          : [],
      ),
    remove: (deviceID, region) => {
      held.get(deviceID)?.delete(region);
    },
  };
}
