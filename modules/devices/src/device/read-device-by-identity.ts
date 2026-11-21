import type { Kysely } from 'kysely';
import type { Device, DeviceTables } from '../types';
import { toDevice } from './to-device';

export async function readDeviceByIdentity(
  db: Kysely<unknown>,
  identityID: string,
): Promise<Device | null> {
  const row = await db
    .$extendTables<DeviceTables>()
    .selectFrom('devices')
    .selectAll()
    .where('identity_id', '=', identityID)
    .executeTakeFirst();

  return row === undefined ? null : toDevice(row);
}
