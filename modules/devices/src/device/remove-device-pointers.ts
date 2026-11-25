import type { Transaction } from 'kysely';
import type { DeviceTables } from '../types';

// A log reset removes every record, so no device shows, keeps a scene or holds a layout that names
// one.
export async function removeDevicePointers(tx: Transaction<unknown>): Promise<void> {
  const db = tx.$extendTables<DeviceTables>();

  await db.deleteFrom('device_regions').execute();
  await db.deleteFrom('device_layouts').execute();
  await db.deleteFrom('device_saved_layouts').execute();
  await db.updateTable('devices').set({ shown_sequence: null, idle_sequence: null }).execute();
}
