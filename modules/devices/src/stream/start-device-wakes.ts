import type { Definitions, Log, RecordInput, WriteTransaction } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { readDeviceWake } from '../device/read-device-wake';
import { deviceStatusChangedCodec } from '../record/device-status-changed-codec';
import type { DeviceStatusChange, DeviceStreams } from './create-device-streams';

export interface DeviceWakesOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly streams: DeviceStreams;

  // the thread of the conversation, which a device change wakes
  readonly thread: string;

  // writes the record as the conversation's inbox takes it, which wakes the model
  readonly writeWake: (tx: WriteTransaction, input: RecordInput) => Promise<void>;
  readonly onFailure: (error: unknown) => void;
}

// Writes a record to the conversation when a device goes online or offline and the list that
// devices.watch set for it names that change. A device that no call named wakes nothing. It
// returns the function that stops it.
export function startDeviceWakes(options: DeviceWakesOptions): () => void {
  return options.streams.subscribeToStatus((change) => {
    void handleDeviceChange(options, change);
  });
}

async function handleDeviceChange(
  options: DeviceWakesOptions,
  change: DeviceStatusChange,
): Promise<void> {
  try {
    await writeDeviceWake(options, change);
  } catch (error) {
    options.onFailure(error);
  }
}

async function writeDeviceWake(
  options: DeviceWakesOptions,
  change: DeviceStatusChange,
): Promise<void> {
  const wake = await readDeviceWake(options.log, change.deviceID);

  if (!wake.includes(change.status)) {
    return;
  }

  const device = await readDeviceByShortID(options.log.writer.db, change.deviceID);

  if (device === null) {
    return;
  }

  await withWriteTransaction(options.log.writer, (tx) =>
    options.writeWake(tx, {
      kind: deviceStatusChangedCodec.kind,
      definitions: options.definitions(),
      thread: options.thread,
      payload: deviceStatusChangedCodec.encode({
        device: device.deviceID,
        name: device.name,
        status: change.status,
        at: change.atMs,
      }),
    }),
  );
}
