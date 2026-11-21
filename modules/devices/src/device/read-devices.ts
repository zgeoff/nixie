import type { Kysely } from 'kysely';
import type { Device, DeviceTables } from '../types';
import { toDevice } from './to-device';

export async function readDevices(db: Kysely<unknown>): Promise<readonly Device[]> {
  const rows = await db
    .$extendTables<DeviceTables>()
    .selectFrom('devices')
    .selectAll()
    .orderBy('updated_at', 'desc')
    .orderBy('device_id')
    .execute();

  return rows.map((row) => toDevice(row));
}
