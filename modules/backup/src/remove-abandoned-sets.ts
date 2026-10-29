import { join } from 'node:path';
import type { DataStorage } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { parseBackupSetName, readBackupSets } from '@heynixie/wire';
import { getBackupStagingDir } from './get-backup-staging-dir';
import { removedSetSuffix } from './remove-recorded-set';
import type { BackupContext, BackupSetState, BackupTables } from './types';
import { writeBackupSetState } from './write-backup-set-state';

export interface AbandonedSets {
  readonly sequences: readonly number[];
}

// It runs before the first set of a start, while no copy is in flight, so a set with no marker is
// one an earlier process stopped copying. The job never ships it, and nothing else would remove it.
export async function removeAbandonedSets(context: BackupContext): Promise<AbandonedSets> {
  const stagingDir = getBackupStagingDir(context.writer.dataDir);

  const removed = await removeHalfRemovedSets(context.storage.files, stagingDir);
  const sets = await readBackupSets(context.storage.files, stagingDir);

  const unmarked = sets.filter((set) => !set.hasMarker);

  for (const set of unmarked) {
    await context.storage.files.removeFile(set.directory);
  }

  if (removed > 0 || unmarked.length > 0) {
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
      await writeBackupSetState(tx, move.sequence, move.to);
    }

    return changed.filter((move) => move.to === 'abandoned').map((move) => move.sequence);
  });

  return { sequences: abandoned };
}

// A stop after a recorded set's rename and before its removal leaves the renamed folder, which no
// later pass reads as a set.
async function removeHalfRemovedSets(
  files: DataStorage['files'],
  stagingDir: string,
): Promise<number> {
  const names = await files.readDirectory(stagingDir).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const removed = names.filter(
    (name) =>
      name.endsWith(removedSetSuffix) &&
      parseBackupSetName(name.slice(0, -removedSetSuffix.length)) !== null,
  );

  for (const name of removed) {
    await files.removeFile(join(stagingDir, name));
  }

  return removed.length;
}
