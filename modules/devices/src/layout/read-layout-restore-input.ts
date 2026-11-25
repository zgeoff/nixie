import type { Log } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { deviceLayoutSetCodec } from '../record/device-layout-set-codec';
import { readScreenRecord } from '../screen/read-screen-record';
import type { SavedLayoutState } from './pick-layout-restore';
import { readRegionState } from './read-region-state';
import type { SavedLayout } from './read-saved-layouts';

type SavedGrid = NonNullable<ReturnType<typeof deviceLayoutSetCodec.decode>['layout']>;

// A saved layout's grid, and whether each saved region's content record still shows that content at
// this time. A region that now shows an earlier record, because the saved one's minutes ran out, no
// longer shows it.
export async function readLayoutRestoreInput(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  layout: SavedLayout,
  nowMs: number,
): Promise<SavedLayoutState<SavedGrid>> {
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

  return { grid, states };
}
