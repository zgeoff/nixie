import { createShortID } from '@heynixie/db';
import type { Transaction } from 'kysely';
import type { DeviceKind, DeviceTables } from '../types';

interface NewDevice {
  readonly identityID: string;
  readonly name: string;
  readonly nowMs: number;
  readonly deviceKind: DeviceKind;
}

// The row of a session that just enrolled. A client device starts with its screen on, so the
// assistant may draw on it, and a screen device starts with every capability off. The short ID is
// the only ID the model sees.
export async function writeDevice(tx: Transaction<unknown>, device: NewDevice): Promise<string> {
  const deviceID = createShortID();

  await tx
    .$extendTables<DeviceTables>()
    .insertInto('devices')
    .values({
      device_id: deviceID,
      identity_id: device.identityID,
      name: device.name,
      capabilities: JSON.stringify({
        screen: device.deviceKind === 'client',
        camera: false,
        speaker: false,
        microphone: false,
      }),
      shown_sequence: null,
      idle_sequence: null,
      device_kind: device.deviceKind,
      updated_at: device.nowMs,
    })
    .execute();

  return deviceID;
}
