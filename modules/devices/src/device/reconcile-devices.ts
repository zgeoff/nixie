import { sql } from 'kysely';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { removeDevice } from './remove-device';

const revokedRowSchema = z.object({ identity_id: z.string() });

// Brings the device rows in step with the sessions after a stretch with the devices feature off,
// when no hook saw a session be revoked or renamed: a revoked session loses its row, and a row
// takes the label its session holds now.
export async function reconcileDevices(tx: Transaction<unknown>, nowMs: number): Promise<void> {
  const revoked = await sql`select devices.identity_id from devices
    join identities on identities.identity_id = devices.identity_id
    where identities.revoked_at is not null`.execute(tx);

  for (const row of revoked.rows) {
    await removeDevice(tx, revokedRowSchema.parse(row).identity_id);
  }

  await sql`update devices
    set name = (select label from identities where identities.identity_id = devices.identity_id),
      updated_at = ${nowMs}
    where exists (
      select 1 from identities
      where identities.identity_id = devices.identity_id and identities.label <> devices.name
    )`.execute(tx);
}
