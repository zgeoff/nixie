// How many errors the server keeps for one region of one device
export const pageErrorLimit = 20;

export interface PageError {
  readonly region: string;

  // the short ID of the content that raised it
  readonly shown: string;
  readonly atMs: number;
  readonly message: string;
}

export interface PageErrors {
  // keeps the error; the region's errors of other content are dropped, and only the newest 20 stay
  readonly record: (deviceID: string, error: PageError) => void;

  // The errors of each region whose current content is the one named, oldest first. A region that
  // shows other content by now has none.
  readonly read: (deviceID: string, current: ReadonlyMap<string, string>) => readonly PageError[];
}

// The last errors of each region, in memory only: a restart forgets them, as it forgets the open
// streams.
export function createPageErrors(): PageErrors {
  const held = new Map<string, Map<string, PageError[]>>();

  return {
    record: (deviceID, error) => {
      const regions = held.get(deviceID) ?? new Map<string, PageError[]>();
      const kept = regions.get(error.region) ?? [];
      const same = kept.filter((candidate) => candidate.shown === error.shown);

      regions.set(error.region, [...same, error].slice(-pageErrorLimit));
      held.set(deviceID, regions);
    },
    read: (deviceID, current) =>
      [...(held.get(deviceID)?.values() ?? [])].flatMap((errors) =>
        errors.filter((error) => current.get(error.region) === error.shown),
      ),
  };
}
