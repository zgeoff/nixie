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
}

// Records a show with its content sealed under the record's own key, and points the device at it.
export function writeShow(options: DeviceToolOptions, show: ShowWrite): Promise<void> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceShownCodec.kind,
        definitions: options.definitions(),
        thread: show.thread,
        payload: deviceShownCodec.encode({ device: show.deviceID, until: show.untilMs }),
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
  });
}
