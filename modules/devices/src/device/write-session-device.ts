import type { Transaction } from 'kysely';
import { readDeviceByIdentity } from './read-device-by-identity';
import { updateDeviceName } from './update-device-name';
import { writeDevice } from './write-device';

interface SessionDevice {
  readonly identityID: string;
  readonly name: string;
  readonly nowMs: number;
}

// The device row of a full session, which holds at most one: a session with a row keeps it under
// the new name and screen, and a session with none gets a client row. Returns the row's short ID.
export async function writeSessionDevice(
  tx: Transaction<unknown>,
  device: SessionDevice,
): Promise<string> {
  const existing = await readDeviceByIdentity(tx, device.identityID);

  if (existing === null) {
    return writeDevice(tx, { ...device, deviceKind: 'client' });
  }

  await updateDeviceName(tx, device);

  return existing.deviceID;
}
