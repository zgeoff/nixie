import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { deviceCapabilityChangedCodec } from '../record/device-capability-changed-codec';
import type { Device, DeviceTables } from '../types';

interface ScreenSwitch {
  readonly device: Device;
  readonly isOn: boolean;
  readonly nowMs: number;
  readonly definitions: Definitions;
}

// Switches a device's screen, which only the device itself asks for, and records the change.
export async function writeScreenSwitch(
  tx: Transaction<unknown>,
  log: Log,
  change: ScreenSwitch,
): Promise<void> {
  await writeRecordsInTransaction(tx, log, [
    {
      kind: deviceCapabilityChangedCodec.kind,
      definitions: change.definitions,
      payload: deviceCapabilityChangedCodec.encode({
        device: change.device.deviceID,
        capability: 'screen',
        isOn: change.isOn,
      }),
    },
  ]);

  await tx
    .$extendTables<DeviceTables>()
    .updateTable('devices')
    .set({
      capabilities: JSON.stringify({ ...change.device.capabilities, screen: change.isOn }),
      updated_at: change.nowMs,
    })
    .where('device_id', '=', change.device.deviceID)
    .execute();
}
