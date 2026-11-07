import type { ForgetBackup } from './pick-forget-backup';
import { pickForgetBackup } from './pick-forget-backup';
import type { BackupTables, BackupWriter } from './types';

// A set covers a forget once its copy started at or after the forget's closing record, because the
// forget deletes its keys before it writes that record.
export async function readForgetBackup(
  writer: BackupWriter,
  forgetSequence: number,
): Promise<ForgetBackup> {
  const sets = await writer.db
    .$extendTables<BackupTables>()
    .selectFrom('backup_sets')
    .select(['state', 'receipt'])
    .where('log_head', '>=', forgetSequence)
    .orderBy('sequence', 'desc')
    .execute();

  return pickForgetBackup(sets);
}
