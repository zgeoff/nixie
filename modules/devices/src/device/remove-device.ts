import type { Transaction } from 'kysely';
import type { DeviceTables } from '../types';

// Removes the row of the device that a session enrolled, with what it showed, its layout and its saved layouts.
export async function removeDevice(tx: Transaction<unknown>, identityID: string): Promise<void> {
  const db = tx.$extendTables<DeviceTables>();

  const device = await db
    .selectFrom('devices')
    .select('device_id')
    .where('identity_id', '=', identityID)
    .executeTakeFirst();

  if (device !== undefined) {
    await db.deleteFrom('device_regions').where('device_id', '=', device.device_id).execute();
    await db.deleteFrom('device_layouts').where('device_id', '=', device.device_id).execute();
    await db.deleteFrom('device_saved_layouts').where('device_id', '=', device.device_id).execute();
  }

  await db.deleteFrom('devices').where('identity_id', '=', identityID).execute();
}
