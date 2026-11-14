import { join } from 'node:path';
import { readPause, withWriteTransaction, writeDatabasePair } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { BackupSetKind, BackupSetManifest } from '@heynixie/wire';
import {
  backupSetFiles,
  backupSetLayout,
  formatBackupFile,
  getBackupSetDir,
  readBackupSets,
} from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { getBackupStagingDir } from './get-backup-staging-dir';
import type { BackupContext, BackupTables } from './types';
import { writeBackupSetState } from './write-backup-set-state';

export async function writeSnapshotSet(
  context: BackupContext,
  kind: BackupSetKind,
): Promise<BackupSetManifest | null> {
  const files = context.storage.files;
  const stagingDir = getBackupStagingDir(context.writer.dataDir);

  await files.createDirectories(stagingDir);

  const started = await createSetRow(context, kind, stagingDir);

  if (started === null) {
    return null;
  }

  const directory = getBackupSetDir(stagingDir, started.sequence);

  const created = await files.createDirectory(directory);

  invariant(created, 'each set takes a sequence above every set directory in staging');

  const markerPath = join(directory, backupSetLayout.marker);

  // the schedule tries again after a failed set, so a set that fails before its marker leaves
  // neither its copies nor a staging row behind; once the marker exists the job may be shipping the
  // set, so a later failure leaves it for the restart to reconcile
  const manifest = await writeMarkedSet(context, kind, started, directory).catch(
    async (error: unknown) => {
      const isMarked = await files.probeFile(markerPath);

      if (!isMarked) {
        await files.removeFile(directory);

        await withWriteTransaction(context.writer, (tx) =>
          writeBackupSetState(tx, started.sequence, 'abandoned'),
        );
      }

      throw error;
    },
  );

  await files.writeFileToDisk(markerPath);
  await files.writeDirectoryToDisk(directory);

  await withWriteTransaction(context.writer, (tx) =>
    writeBackupSetState(tx, started.sequence, 'staged'),
  );

  return manifest;
}

interface StartedSet {
  readonly sequence: number;
  readonly stagedAt: number;
}

// A restore can bring back a database whose newest set is older than a directory still in staging,
// so the sequence also passes every set name there. While nixie is paused after a restore it stages
// nothing, because the first publish would replace the key snapshot the restore came from.
async function createSetRow(
  context: BackupContext,
  kind: BackupSetKind,
  stagingDir: string,
): Promise<StartedSet | null> {
  const staged = await readBackupSets(context.storage.files, stagingDir);

  const newestStaged = staged.at(-1)?.sequence ?? 0;
  const stagedAt = context.writer.clock.now();

  return withWriteTransaction(context.writer, async (tx) => {
    const pause = await readPause(tx);

    if (pause?.cause === 'restore') {
      return null;
    }

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

async function writeMarkedSet(
  context: BackupContext,
  kind: BackupSetKind,
  started: StartedSet,
  directory: string,
): Promise<BackupSetManifest> {
  const manifest = await writeSetCopies(context, kind, started, directory);

  await context.storage.files.writeFile(join(directory, backupSetLayout.marker), '');

  return manifest;
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
      const digest = await files.readFileSHA256(join(directory, name));

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
