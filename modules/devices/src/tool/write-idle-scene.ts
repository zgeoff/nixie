import type { ScreenContent } from '@heynixie/contract';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { deviceIdleSetCodec } from '../record/device-idle-set-codec';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface SceneWrite {
  readonly deviceID: string;
  readonly thread: string;
  readonly scene: readonly ScreenContent[];
}

// Records an idle scene the same way, and points the device at it.
export function writeIdleScene(options: DeviceToolOptions, scene: SceneWrite): Promise<void> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceIdleSetCodec.kind,
        definitions: options.definitions(),
        thread: scene.thread,
        payload: deviceIdleSetCodec.encode({ device: scene.deviceID }),
        erasable: { scene: [...scene.scene] },
      },
    ]);

    invariant(record, 'the log wrote no device.idle_set record');

    await tx
      .$extendTables<DeviceTables>()
      .updateTable('devices')
      .set({ idle_sequence: record.sequence, updated_at: options.clock.now() })
      .where('device_id', '=', scene.deviceID)
      .execute();
  });
}
