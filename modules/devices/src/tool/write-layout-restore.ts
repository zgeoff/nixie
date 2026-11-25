import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readSavedLayouts } from '../layout/read-saved-layouts';
import { deviceLayoutRestoredCodec } from '../record/device-layout-restored-codec';
import { deviceLayoutSetCodec } from '../record/device-layout-set-codec';
import { readScreenRecord } from '../screen/read-screen-record';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface LayoutRestoreWrite {
  readonly deviceID: string;
  readonly thread: string;
  readonly name: string;
}

export type LayoutRestoreOutcome =
  | {
      readonly status: 'restored';
      readonly layoutID: string;
      readonly regions: readonly string[];

      // the regions that come back blank, because their content was forgotten
      readonly emptied: readonly string[];
    }
  | { readonly status: 'unknown'; readonly names: readonly string[] };

// Puts a saved layout back in one transaction: the grid under a new layout record, so a call queued
// against the layout before the restore still refuses, and each region's saved content record. A
// region whose content record a forget erased comes back blank, and the outcome names it.
export function writeLayoutRestore(
  options: DeviceToolOptions,
  write: LayoutRestoreWrite,
): Promise<LayoutRestoreOutcome> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const saved = await readSavedLayouts(tx, write.deviceID);

    const layout = saved.find((candidate) => candidate.name === write.name);

    if (layout === undefined) {
      return { status: 'unknown', names: saved.map((candidate) => candidate.name) };
    }

    const inTransaction = { ...options.log, writer: { ...options.log.writer, db: tx } };

    const layoutRecord = await readScreenRecord(inTransaction, layout.layoutSequence);

    invariant(layoutRecord, 'a saved layout names a layout record that is gone');

    const grid = deviceLayoutSetCodec.decode(layoutRecord.payload).layout;

    invariant(grid, 'a saved layout names a layout record with no grid');

    const layoutID = createShortID();

    const names = new Set(grid.regions.map((region) => region.name));

    const kept: { region: string; shownSequence: number }[] = [];
    const emptied: string[] = [];

    for (const region of layout.regions) {
      if (!names.has(region.region)) {
        continue;
      }

      const content = await readScreenRecord(inTransaction, region.shownSequence);

      if (content === null || content.fields === null) {
        emptied.push(region.region);
      } else {
        kept.push(region);
      }
    }

    const [layoutSet, restored] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceLayoutSetCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceLayoutSetCodec.encode({ device: write.deviceID, layoutID, layout: grid }),
      },
      {
        kind: deviceLayoutRestoredCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceLayoutRestoredCodec.encode({
          device: write.deviceID,
          name: write.name,
          layoutID,
          emptied,
        }),
      },
    ]);

    invariant(layoutSet && restored, 'the log wrote no records for the restore');

    const db = tx.$extendTables<DeviceTables>();
    const nowMs = options.clock.now();

    await db.deleteFrom('device_regions').where('device_id', '=', write.deviceID).execute();

    for (const region of kept) {
      await db
        .insertInto('device_regions')
        .values({
          device_id: write.deviceID,
          region: region.region,
          shown_sequence: region.shownSequence,
        })
        .execute();
    }

    await db
      .insertInto('device_layouts')
      .values({
        device_id: write.deviceID,
        layout_sequence: layoutSet.sequence,
        updated_at: nowMs,
      })
      .onConflict((conflict) =>
        conflict
          .column('device_id')
          .doUpdateSet({ layout_sequence: layoutSet.sequence, updated_at: nowMs }),
      )
      .execute();

    await db
      .updateTable('devices')
      .set({ updated_at: nowMs })
      .where('device_id', '=', write.deviceID)
      .execute();

    return {
      status: 'restored',
      layoutID,
      regions: grid.regions.map((region) => region.name),
      emptied,
    };
  });
}
