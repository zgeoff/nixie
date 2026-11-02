import { dirname, join } from 'node:path';
import { claimBackupLock } from './claim-backup-lock';
import type { DataFile } from './data-files';
import { dataFiles } from './data-files';
import type { DataRefusal } from './data-refusal';
import type { DataStorage } from './data-storage';
import { getBackupMarkerPath } from './get-backup-marker-path';
import { readRestoreState } from './read-restore-state';
import { requireDataFiles } from './require-data-files';
import { writeDatabasePair } from './write-database-pair';

export interface DataBackupOptions {
  readonly storage: DataStorage;
  readonly dataDir: string;
  readonly directory: string;
  readonly onCopied: (file: DataFile) => Promise<void> | void;
}

export interface DataBackup {
  readonly files: readonly DataFile[];
  readonly attempts: number;
}

export async function writeDataBackup(
  options: DataBackupOptions,
): Promise<DataBackup | DataRefusal> {
  await requireDataFiles(
    options.storage.files,
    options.dataDir,
    `the data directory ${options.dataDir}`,
  );

  const lock = await claimBackupLock(options.storage, options.dataDir, 'shared');

  if (lock === null) {
    return { refused: 'restore-running' };
  }

  try {
    await requireFinishedRestore(options);
    await createBackupDirectory(options);
    await writeBackupMarker(options);

    await options.storage.files.createDirectories(getCopyingPath(options.directory));

    const attempts = await writeDatabasePair({
      ...options,
      directory: getCopyingPath(options.directory),
    });

    await publishCopies(options);

    return { files: dataFiles, attempts };
  } finally {
    lock.release();
  }
}

async function requireFinishedRestore(options: DataBackupOptions): Promise<void> {
  const state = await readRestoreState(options.storage.files, options.dataDir);

  if (state === 'replacing') {
    throw new Error(
      `a restore of the data directory ${options.dataDir} stopped before it finished, so nixie backs up nothing`,
    );
  }
}

// Creating the directory claims it, so a second backup into the same path stops before it copies.
async function createBackupDirectory(options: DataBackupOptions): Promise<void> {
  await options.storage.files.createDirectories(dirname(options.directory));

  const created = await options.storage.files.createDirectory(options.directory);

  if (!created) {
    throw new Error(
      `nixie backs up only into a directory it creates, and ${options.directory} exists`,
    );
  }
}

// The marker reaches the disk before the first copy and leaves only once the checked pair is in
// place, and a restore refuses a directory that holds it, so a backup that stops at any point
// leaves nothing a restore takes.
async function writeBackupMarker(options: DataBackupOptions): Promise<void> {
  await options.storage.files.writeFile(getBackupMarkerPath(options.directory), '');
  await options.storage.files.writeDirectoryToDisk(options.directory);
}

function getCopyingPath(directory: string): string {
  return join(directory, '.copying');
}

async function publishCopies(options: DataBackupOptions): Promise<void> {
  const files = options.storage.files;
  const copying = getCopyingPath(options.directory);

  for (const file of dataFiles) {
    await files.renameFile(join(copying, file), join(options.directory, file));
  }

  await files.removeFile(copying);
  await files.writeDirectoryToDisk(options.directory);
  await files.removeFile(getBackupMarkerPath(options.directory));
  await files.writeDirectoryToDisk(options.directory);
}
