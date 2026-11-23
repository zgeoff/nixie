import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { deviceLayoutSetCodec } from '../record/device-layout-set-codec';
import type { DeviceTables, LayoutGeometry } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface LayoutWrite {
  readonly deviceID: string;
  readonly thread: string;

  // null clears the layout
  readonly layout: LayoutGeometry | null;
}

// Records a layout, points the device at it, and clears every region: a new layout starts blank. The
// short ID of the record is the layout's.
export function writeLayout(options: DeviceToolOptions, write: LayoutWrite): Promise<string> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const layoutID = createShortID();

    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceLayoutSetCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceLayoutSetCodec.encode({
          device: write.deviceID,
          layoutID,
          layout:
            write.layout === null
              ? null
              : {
                  columns: [...write.layout.columns],
                  rows: [...write.layout.rows],
                  regions: write.layout.regions.map((region) => ({ ...region })),
                },
        }),
      },
    ]);

    invariant(record, 'the log wrote no device.layout_set record');

    const db = tx.$extendTables<DeviceTables>();
    const nowMs = options.clock.now();

    await db.deleteFrom('device_regions').where('device_id', '=', write.deviceID).execute();

    await db
      .insertInto('device_layouts')
      .values({ device_id: write.deviceID, layout_sequence: record.sequence, updated_at: nowMs })
      .onConflict((conflict) =>
        conflict
          .column('device_id')
          .doUpdateSet({ layout_sequence: record.sequence, updated_at: nowMs }),
      )
      .execute();

    await db
      .updateTable('devices')
      .set({ updated_at: nowMs })
      .where('device_id', '=', write.deviceID)
      .execute();

    return layoutID;
  });
}
