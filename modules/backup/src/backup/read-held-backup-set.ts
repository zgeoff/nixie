import type { BackupTables, BackupWriter } from '../types';

// A set that is still copying holds the next set back too, though the schedule's pass never sees
// one: its actor runs one step at a time.
export async function readHeldBackupSet(writer: BackupWriter): Promise<number | null> {
  const db = writer.db.$extendTables<BackupTables>();

  const held = await db
    .selectFrom('backup_sets')
    .select((eb) => eb.fn.max('sequence').as('sequence'))
    .where('state', 'in', ['staging', 'staged'])
    .executeTakeFirst();

  return held?.sequence ?? null;
}
