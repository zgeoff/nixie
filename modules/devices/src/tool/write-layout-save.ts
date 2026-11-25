import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readLayout } from '../layout/read-layout';
import { deviceLayoutSavedCodec } from '../record/device-layout-saved-codec';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface LayoutSaveWrite {
  readonly deviceID: string;
  readonly thread: string;
  readonly name: string;
}

// Saves the device's current layout under a name, as sequences and never content. A save under a
// name that is taken replaces it. Null comes back, with nothing written, for a device with no layout.
export function writeLayoutSave(
  options: DeviceToolOptions,
  write: LayoutSaveWrite,
): Promise<'saved' | 'replaced' | null> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const inTransaction = { ...options.log, writer: { ...options.log.writer, db: tx } };

    const layout = await readLayout(inTransaction, write.deviceID, options.clock.now());

    const db = tx.$extendTables<DeviceTables>();

    const current = await db
      .selectFrom('device_layouts')
      .select('layout_sequence')
      .where('device_id', '=', write.deviceID)
      .executeTakeFirst();

    if (layout === null || current === undefined) {
      return null;
    }

    const pointers = await db
      .selectFrom('device_regions')
      .select(['region', 'shown_sequence'])
      .where('device_id', '=', write.deviceID)
      .execute();

    const regionNames = new Set(layout.regions.map((region) => region.name));

    const regions = pointers
      .filter((pointer) => regionNames.has(pointer.region))
      .map((pointer) => ({ region: pointer.region, shownSequence: pointer.shown_sequence }));

    const existing = await db
      .selectFrom('device_saved_layouts')
      .select('saved_id')
      .where('device_id', '=', write.deviceID)
      .where('name', '=', write.name)
      .executeTakeFirst();

    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceLayoutSavedCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceLayoutSavedCodec.encode({
          device: write.deviceID,
          name: write.name,
          isReplaced: existing !== undefined,
        }),
      },
    ]);

    invariant(record, 'the log wrote no device.layout_saved record');

    await db
      .insertInto('device_saved_layouts')
      .values({
        saved_id: crypto.randomUUID(),
        device_id: write.deviceID,
        name: write.name,
        layout_sequence: current.layout_sequence,
        regions: JSON.stringify(regions),
        saved_at: options.clock.now(),
      })
      .onConflict((conflict) =>
        conflict.columns(['device_id', 'name']).doUpdateSet({
          layout_sequence: current.layout_sequence,
          regions: JSON.stringify(regions),
          saved_at: options.clock.now(),
        }),
      )
      .execute();

    return existing === undefined ? 'saved' : 'replaced';
  });
}
