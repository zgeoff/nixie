import type { RegionContent } from '@heynixie/contract';
import { createShortID } from '@heynixie/db';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readLayout } from '../layout/read-layout';
import { deviceRegionShownCodec } from '../record/device-region-shown-codec';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface RegionWrite {
  readonly deviceID: string;
  readonly thread: string;

  // the sequence of the call's own record: a layout set after it replaced the one the call was
  // queued against, so the write refuses
  readonly callSequence: number;
  readonly region: string;
  readonly content: RegionContent;
  readonly untilMs: number | null;
  readonly onEnd: 'blank' | 'previous';
}

// Records a region's content sealed under the record's own key, and points the region at it. The
// layout and the content it covers are read in the write's own transaction, so null comes back,
// with nothing written, for a layout set after the call or a region it lacks.
export async function writeRegion(
  options: DeviceToolOptions,
  write: RegionWrite,
): Promise<'written' | null> {
  const outcome = await withWriteTransaction(options.log.writer, async (tx) => {
    const inTransaction = { ...options.log, writer: { ...options.log.writer, db: tx } };

    const layout = await readLayout(inTransaction, write.deviceID, options.clock.now());

    const region = layout?.regions.find((candidate) => candidate.name === write.region);

    const row = await tx
      .$extendTables<DeviceTables>()
      .selectFrom('device_layouts')
      .select('layout_sequence')
      .where('device_id', '=', write.deviceID)
      .executeTakeFirst();

    if (row === undefined || row.layout_sequence > write.callSequence || region === undefined) {
      return null;
    }

    const shownID = createShortID();

    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceRegionShownCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceRegionShownCodec.encode({
          device: write.deviceID,
          region: write.region,
          shownID,
          contentKind: write.content.kind,
          until: write.untilMs,
          onEnd: write.onEnd,
          previous: write.onEnd === 'previous' ? (region.shown?.sequence ?? null) : null,
        }),
        erasable: { content: toStoredContent(write.content) },
      },
    ]);

    invariant(record, 'the log wrote no device.region_shown record');

    const db = tx.$extendTables<DeviceTables>();

    await db
      .insertInto('device_regions')
      .values({
        device_id: write.deviceID,
        region: write.region,
        shown_sequence: record.sequence,
      })
      .onConflict((conflict) =>
        conflict.columns(['device_id', 'region']).doUpdateSet({ shown_sequence: record.sequence }),
      )
      .execute();

    await db
      .updateTable('devices')
      .set({ updated_at: options.clock.now() })
      .where('device_id', '=', write.deviceID)
      .execute();

    return 'written';
  });

  if (outcome === 'written') {
    options.streams.errors.remove(write.deviceID, write.region);
  }

  return outcome;
}

// The content as a JSON object, which leaves out a label that the call left out.
function toStoredContent(content: RegionContent): JSONObject {
  if (content.kind === 'live' && content.live === 'countdown') {
    const countdown = { kind: content.kind, live: content.live, to: content.to };

    return content.label === undefined ? countdown : { ...countdown, label: content.label };
  }

  return content;
}
