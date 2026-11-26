import { readLayout } from '../layout/read-layout';
import type { PageFetchesOptions } from './types';

// Drops what the streams hold of each page region that shows other content by now, or none, so a
// replaced, expired or forgotten page keeps no fetched body in memory. A region that a call declared
// anew while this ran keeps its declaration.
export async function removeGoneFetches(options: PageFetchesOptions): Promise<void> {
  for (const held of options.streams.fetches.readRegions()) {
    const layout = await readLayout(options.log, held.deviceID, options.clock.now());

    const shown = layout?.regions.find((region) => region.name === held.region)?.shown?.shownID;
    const current = options.streams.fetches.readHeld(held.deviceID, held.region);

    if (shown !== held.shown && current?.shown === held.shown) {
      options.streams.fetches.remove(held.deviceID, held.region);
    }
  }
}
