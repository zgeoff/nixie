import type { RegionContent } from '@heynixie/contract';
import { createShortID } from '@heynixie/db';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { deviceRegionShownCodec } from '../record/device-region-shown-codec';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface RegionWrite {
  readonly deviceID: string;
  readonly thread: string;
  readonly region: string;
  readonly content: RegionContent;
  readonly untilMs: number | null;
  readonly onEnd: 'blank' | 'previous';

  // the record of the content this one covers, which an `onEnd` of 'previous' brings back
  readonly previous: number | null;
}

// Records a region's content with the content sealed under the record's own key, and points the
// region at it. The short ID of the record is the content's.
export function writeRegion(options: DeviceToolOptions, write: RegionWrite): Promise<string> {
  return withWriteTransaction(options.log.writer, async (tx) => {
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
          previous: write.previous,
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

    return shownID;
  });
}

// The content as a JSON object, which leaves out a label that the call left out.
function toStoredContent(content: RegionContent): JSONObject {
  if (content.kind === 'live' && content.live === 'countdown') {
    const countdown = { kind: content.kind, live: content.live, to: content.to };

    return content.label === undefined ? countdown : { ...countdown, label: content.label };
  }

  return content;
}
