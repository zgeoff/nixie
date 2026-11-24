import type { ScreenContent } from '@heynixie/contract';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { deviceShownCodec } from '../record/device-shown-codec';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface ShowWrite {
  readonly deviceID: string;
  readonly thread: string;
  readonly content: ScreenContent;
  readonly untilMs: number | null;

  // how long the show lasts once its device comes online, for a show that waits for an offline one
  readonly lastsMs?: number | null;

  // writes only while the device still points at this show, and answers whether it wrote
  readonly ifShownSequence?: number;
}

// Records a show with its content sealed under the record's own key, and points the device at it.
export function writeShow(
  options: Pick<DeviceToolOptions, 'log' | 'definitions' | 'clock'>,
  show: ShowWrite,
): Promise<boolean> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    if (show.ifShownSequence !== undefined) {
      const current = await tx
        .$extendTables<DeviceTables>()
        .selectFrom('devices')
        .select('shown_sequence')
        .where('device_id', '=', show.deviceID)
        .executeTakeFirst();

      if (current?.shown_sequence !== show.ifShownSequence) {
        return false;
      }
    }

    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceShownCodec.kind,
        definitions: options.definitions(),
        thread: show.thread,
        payload: deviceShownCodec.encode({
          device: show.deviceID,
          until: show.untilMs,
          ...(show.lastsMs === undefined ? {} : { lastsMs: show.lastsMs }),
        }),
        erasable: { content: show.content },
      },
    ]);

    invariant(record, 'the log wrote no device.shown record');

    await tx
      .$extendTables<DeviceTables>()
      .updateTable('devices')
      .set({ shown_sequence: record.sequence, updated_at: options.clock.now() })
      .where('device_id', '=', show.deviceID)
      .execute();

    return true;
  });
}
