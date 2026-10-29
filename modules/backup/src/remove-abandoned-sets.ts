import { withWriteTransaction } from '@heynixie/log';
import { readBackupSets } from '@heynixie/wire';
import { requireBackupSetMove } from './backup-set-moves';
import { getBackupStagingDir } from './get-backup-staging-dir';
import type { BackupContext, BackupSetState, BackupTables } from './types';

export interface AbandonedSets {
  readonly sequences: readonly number[];
}

// It runs before the first set of a start, while no copy is in flight, so a set with no marker is
// one an earlier process stopped copying. The job never ships it, and nothing else would remove it.
export async function removeAbandonedSets(context: BackupContext): Promise<AbandonedSets> {
  const stagingDir = getBackupStagingDir(context.writer.dataDir);

  const sets = await readBackupSets(context.storage.files, stagingDir);

  const unmarked = sets.filter((set) => !set.hasMarker);

  for (const set of unmarked) {
    await context.storage.files.removeFile(set.directory);
  }

  if (unmarked.length > 0) {
    await context.storage.files.writeDirectoryToDisk(stagingDir);
  }

  const marked = new Set(sets.filter((set) => set.hasMarker).map((set) => set.sequence));

  const abandoned = await withWriteTransaction(context.writer, async (tx) => {
    const db = tx.$extendTables<BackupTables>();

    const rows = await db
      .selectFrom('backup_sets')
      .select(['sequence', 'state'])
      .where('state', 'in', ['staging', 'staged'])
      .execute();

    const moves = rows.map(
      (row): { sequence: number; from: BackupSetState; to: BackupSetState } => ({
        sequence: row.sequence,
        from: row.state,
        to: marked.has(row.sequence) ? 'staged' : 'abandoned',
      }),
    );

    const changed = moves.filter((move) => move.from !== move.to);

    for (const move of changed) {
      requireBackupSetMove(move.from, move.to);

      await db
        .updateTable('backup_sets')
        .set({ state: move.to })
        .where('sequence', '=', move.sequence)
        .execute();
    }

    return changed.filter((move) => move.to === 'abandoned').map((move) => move.sequence);
  });

  return { sequences: abandoned };
}
