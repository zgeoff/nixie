import { createShortID } from '@heynixie/db';
import type { Transaction } from 'kysely';
import type { DeviceTables } from '../types';

interface NewDevice {
  readonly identityID: string;
  readonly name: string;
  readonly nowMs: number;
}

// The row of a device that just enrolled, with every capability off. The short ID is the only ID
// the model sees.
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
        screen: false,
        camera: false,
        speaker: false,
        microphone: false,
      }),
      shown_sequence: null,
      idle_sequence: null,
      updated_at: device.nowMs,
    })
    .execute();

  return deviceID;
}
