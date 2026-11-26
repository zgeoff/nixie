import { buildFetchKey } from './build-fetch-key';
import type { RegionTarget } from './types';

// The schedule key of each declared fetch of a region.
export function buildRegionKeys(target: RegionTarget): string[] {
  return target.fetches.map((fetch) =>
    buildFetchKey(target.deviceID, target.region, target.shown.shownID, fetch.url),
  );
}
