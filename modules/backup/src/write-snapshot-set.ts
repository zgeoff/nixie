import { join } from 'node:path';
import { withWriteTransaction, writeDatabasePair } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { BackupSetKind, BackupSetManifest } from '@heynixie/wire';
import {
  backupSetFiles,
  backupSetLayout,
  formatBackupFile,
  formatBackupSetName,
  readBackupSets,
  readFileSHA256,
} from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { getBackupStagingDir } from './get-backup-staging-dir';
import type { BackupContext, BackupTables } from './types';
import { writeBackupSetState } from './write-backup-set-state';

export async function writeSnapshotSet(
  context: BackupContext,
  kind: BackupSetKind,
): Promise<BackupSetManifest> {
  const files = context.storage.files;
  const stagingDir = getBackupStagingDir(context.writer.dataDir);

  await files.createDirectories(stagingDir);

  const started = await createSetRow(context, kind, stagingDir);

  const directory = join(stagingDir, formatBackupSetName(started.sequence));

  const created = await files.createDirectory(directory);

  invariant(created, 'each set takes a sequence above every set directory in staging');

  // the schedule tries again after a failed copy, so a failed set leaves neither its copies nor a
  // staging row behind; once the marker exists the job may be shipping the set, so a later failure
  // leaves it for the restart to reconcile
  const manifest = await writeSetCopies(context, kind, started, directory).catch(
    async (error: unknown) => {
      await files.removeFile(directory);

      await writeBackupSetState(context.writer, started.sequence, 'abandoned');

      throw error;
    },
  );

  const markerPath = join(directory, backupSetLayout.marker);

  await files.writeFile(markerPath, '');
  await files.writeFileToDisk(markerPath);
  await files.writeDirectoryToDisk(directory);

  await writeBackupSetState(context.writer, started.sequence, 'staged');

  return manifest;
}

interface StartedSet {
  readonly sequence: number;
  readonly stagedAt: number;
}

// A restore can bring back a database whose newest set is older than a directory still in staging,
// so the sequence also passes every set name there.
async function createSetRow(
  context: BackupContext,
  kind: BackupSetKind,
  stagingDir: string,
): Promise<StartedSet> {
  const staged = await readBackupSets(stagingDir);

  const newestStaged = staged.at(-1)?.sequence ?? 0;
  const stagedAt = context.writer.clock.now();

  return withWriteTransaction(context.writer, async (tx) => {
    const db = tx.$extendTables<BackupTables>();

    const head = await db
      .selectFrom('records')
      .select((eb) => eb.fn.max('sequence').as('sequence'))
      .executeTakeFirst();

    const newest = await db
      .selectFrom('backup_sets')
      .select((eb) => eb.fn.max('sequence').as('sequence'))
      .executeTakeFirst();

    const sequence = Math.max(newest?.sequence ?? 0, newestStaged) + 1;

    await db
      .insertInto('backup_sets')
      .values({
        sequence,
        kind,
        state: 'staging',
        log_head: head?.sequence ?? 0,
        staged_at: stagedAt,
      })
      .execute();

    return { sequence, stagedAt };
  });
}

async function writeSetCopies(
  context: BackupContext,
  kind: BackupSetKind,
  started: StartedSet,
  directory: string,
): Promise<BackupSetManifest> {
  const files = context.storage.files;

  await writeDatabasePair({
    storage: context.storage,
    dataDir: context.writer.dataDir,
    directory,
    onCopied: () => {},
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('backup.set.copied', { kind: 'backup', id: String(started.sequence) });
  }

  const copies = await Promise.all(
    backupSetFiles.map(async (name) => {
      const digest = await readFileSHA256(join(directory, name));

      return { name, bytes: digest.bytes, sha256: digest.sha256 };
    }),
  );

  const manifest: BackupSetManifest = {
    format: 1,
    kind,
    sequence: started.sequence,
    stagedAt: started.stagedAt,
    copies,
  };

  // the job ships only a set whose marker exists, so the copies and the manifest reach the disk
  // before the marker does
  const manifestPath = join(directory, backupSetLayout.manifest);

  await files.writeFile(manifestPath, formatBackupFile(manifest));
  await files.writeFileToDisk(manifestPath);
  await files.writeDirectoryToDisk(directory);

  return manifest;
}
