import type { Transaction } from 'kysely';
import type { DeviceTables } from '../types';

// A log reset removes every record, so no device shows or keeps a scene that names one.
export async function removeDevicePointers(tx: Transaction<unknown>): Promise<void> {
  await tx
    .$extendTables<DeviceTables>()
    .updateTable('devices')
    .set({ shown_sequence: null, idle_sequence: null })
    .execute();
}
