import type { Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { requireBackupSetMove } from './backup-set-moves';
import type { BackupSetState, BackupTables } from './types';

export interface BackupSetReceiptFields {
  readonly received_at: number;
  readonly data_snapshot_id: string | null;
  readonly key_snapshot_id: string | null;
  readonly receipt: string;
}

export async function writeBackupSetState(
  writer: Writer,
  sequence: number,
  state: BackupSetState,
  fields?: BackupSetReceiptFields,
): Promise<void> {
  await withWriteTransaction(writer, async (tx) => {
    const db = tx.$extendTables<BackupTables>();

    const row = await db
      .selectFrom('backup_sets')
      .select('state')
      .where('sequence', '=', sequence)
      .executeTakeFirst();

    invariant(row, `backup set ${String(sequence)} has a row before its state moves`);
    requireBackupSetMove(row.state, state);

    await db
      .updateTable('backup_sets')
      .set({ state, ...fields })
      .where('sequence', '=', sequence)
      .execute();
  });
}
