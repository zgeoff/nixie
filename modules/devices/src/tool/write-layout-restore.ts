import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { pickLayoutRestore } from '../layout/pick-layout-restore';
import { readLayoutRestoreInput } from '../layout/read-layout-restore-input';
import { deviceLayoutRestoredCodec } from '../record/device-layout-restored-codec';
import { deviceLayoutSetCodec } from '../record/device-layout-set-codec';
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

      // the regions that come back blank, because their content was forgotten or ran out
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
    const inTransaction = { ...options.log, writer: { ...options.log.writer, db: tx } };
    const nowMs = options.clock.now();

    const layouts = await readLayoutRestoreInput(inTransaction, write.deviceID, nowMs);

    const plan = pickLayoutRestore(layouts, write.name);

    if (plan.status === 'unknown') {
      return plan;
    }

    const layoutID = createShortID();

    const [layoutSet, restored] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceLayoutSetCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceLayoutSetCodec.encode({
          device: write.deviceID,
          layoutID,
          layout: plan.grid,
        }),
      },
      {
        kind: deviceLayoutRestoredCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceLayoutRestoredCodec.encode({
          device: write.deviceID,
          name: write.name,
          layoutID,
          emptied: plan.emptied,
        }),
      },
    ]);

    invariant(layoutSet && restored, 'the log wrote no records for the restore');

    const db = tx.$extendTables<DeviceTables>();

    await db.deleteFrom('device_regions').where('device_id', '=', write.deviceID).execute();

    for (const region of plan.kept) {
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
      regions: plan.regions,
      emptied: plan.emptied,
    };
  });
}
