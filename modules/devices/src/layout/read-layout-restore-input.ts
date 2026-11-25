import type { Log } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { deviceLayoutSetCodec } from '../record/device-layout-set-codec';
import { readScreenRecord } from '../screen/read-screen-record';
import type { LayoutRestoreInput } from './pick-layout-restore';
import { readRegionState } from './read-region-state';
import { readSavedLayouts } from './read-saved-layouts';

type SavedGrid = NonNullable<ReturnType<typeof deviceLayoutSetCodec.decode>['layout']>;

// What a restore needs to decide: the names a device saved, and for the asked name its grid and
// whether each saved region's content record still shows that content at this time. A region
// that now shows an earlier record, because the saved one's minutes ran out, no longer shows it.
export async function readLayoutRestoreInput(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  deviceID: string,
  name: string,
  nowMs: number,
): Promise<LayoutRestoreInput<SavedGrid>> {
  const saved = await readSavedLayouts(log.writer.db, deviceID);

  const names = saved.map((layout) => layout.name);
  const layout = saved.find((candidate) => candidate.name === name);

  if (layout === undefined) {
    return { names, found: null };
  }

  const layoutRecord = await readScreenRecord(log, layout.layoutSequence);

  invariant(layoutRecord, 'a saved layout names a layout record that is gone');

  const grid = deviceLayoutSetCodec.decode(layoutRecord.payload).layout;

  invariant(grid, 'a saved layout names a layout record with no grid');

  const states = await Promise.all(
    layout.regions.map(async (region) => {
      const shown = await readRegionState(log, region.shownSequence, nowMs);

      return {
        region: region.region,
        shownSequence: region.shownSequence,
        isShown: shown !== null && shown.sequence === region.shownSequence,
      };
    }),
  );

  return { names, found: { grid, states } };
}
