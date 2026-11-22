import type { Transaction } from 'kysely';
import type { DeviceTables } from '../types';

// Removes the row of the device that a session enrolled, with what it showed.
export async function removeDevice(tx: Transaction<unknown>, identityID: string): Promise<void> {
  await tx
    .$extendTables<DeviceTables>()
    .deleteFrom('devices')
    .where('identity_id', '=', identityID)
    .execute();
}
