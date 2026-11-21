import type { Transaction } from 'kysely';
import type { DeviceTables } from '../types';

interface DeviceRename {
  readonly identityID: string;
  readonly name: string;
  readonly nowMs: number;
}

// A session's label replaces the name its device enrolled with.
export async function updateDeviceName(
  tx: Transaction<unknown>,
  change: DeviceRename,
): Promise<void> {
  await tx
    .$extendTables<DeviceTables>()
    .updateTable('devices')
    .set({ name: change.name, updated_at: change.nowMs })
    .where('identity_id', '=', change.identityID)
    .execute();
}
