import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { pickLayoutRemoval } from '../layout/pick-layout-removal';
import { readSavedLayouts } from '../layout/read-saved-layouts';
import { deviceLayoutRemovedCodec } from '../record/device-layout-removed-codec';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface LayoutRemoveWrite {
  readonly deviceID: string;
  readonly thread: string;
  readonly name: string;
}

// Deletes a saved layout and records it. The names that remain come back when no layout has this
// name, with nothing written.
export function writeLayoutRemove(
  options: DeviceToolOptions,
  write: LayoutRemoveWrite,
): Promise<{ readonly removed: boolean; readonly names: readonly string[] }> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const saved = await readSavedLayouts(tx, write.deviceID);

    const outcome = pickLayoutRemoval(
      saved.map((layout) => layout.name),
      write.name,
    );

    if (!outcome.removed) {
      return outcome;
    }

    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceLayoutRemovedCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceLayoutRemovedCodec.encode({ device: write.deviceID, name: write.name }),
      },
    ]);

    invariant(record, 'the log wrote no device.layout_removed record');

    await tx
      .$extendTables<DeviceTables>()
      .deleteFrom('device_saved_layouts')
      .where('device_id', '=', write.deviceID)
      .where('name', '=', write.name)
      .execute();

    return outcome;
  });
}
