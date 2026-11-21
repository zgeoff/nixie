import type { Kysely } from 'kysely';
import type { Device, DeviceTables } from '../types';
import { toDevice } from './to-device';

export async function readDeviceByShortID(
  db: Kysely<unknown>,
  deviceID: string,
): Promise<Device | null> {
  const row = await db
    .$extendTables<DeviceTables>()
    .selectFrom('devices')
    .selectAll()
    .where('device_id', '=', deviceID)
    .executeTakeFirst();

  return row === undefined ? null : toDevice(row);
}
