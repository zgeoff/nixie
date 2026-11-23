import type { Log } from '@heynixie/log';
import { deviceLayoutSetCodec } from '../record/device-layout-set-codec';
import { readScreenRecord } from '../screen/read-screen-record';
import type { DeviceTables, LayoutView, RegionView } from '../types';
import { readRegionState } from './read-region-state';

// A device's saved layout with what each region shows at this time, or null when it has none. A
// layout that a reset removed, or that a clear emptied, counts as none.
export async function readLayout(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  deviceID: string,
  nowMs: number,
): Promise<LayoutView | null> {
  const db = log.writer.db.$extendTables<DeviceTables>();

  const row = await db
    .selectFrom('device_layouts')
    .select('layout_sequence')
    .where('device_id', '=', deviceID)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const record = await readScreenRecord(log, row.layout_sequence);

  if (record === null) {
    return null;
  }

  const payload = deviceLayoutSetCodec.decode(record.payload);

  if (payload.layout === null) {
    return null;
  }

  const pointers = await db
    .selectFrom('device_regions')
    .select(['region', 'shown_sequence'])
    .where('device_id', '=', deviceID)
    .execute();

  const regions = await Promise.all(
    payload.layout.regions.map(async (region): Promise<RegionView> => {
      const pointer = pointers.find((candidate) => candidate.region === region.name);

      return {
        ...region,
        shown:
          pointer === undefined ? null : await readRegionState(log, pointer.shown_sequence, nowMs),
      };
    }),
  );

  return {
    layoutID: payload.layoutID,
    columns: [...payload.layout.columns],
    rows: [...payload.layout.rows],
    regions,
  };
}
