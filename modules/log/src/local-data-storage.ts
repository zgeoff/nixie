import { copyFile, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { createDatabaseCopy, startDatabase } from '@heynixie/db';
import { claimFileLock } from './claim-file-lock';
import type { DataStorage } from './data-storage';

export const localDataStorage: DataStorage = {
  startDatabase,
  writeDatabaseCopy: createDatabaseCopy,
  claimFileLock,
  files: {
    probeFile: (path) => Bun.file(path).exists(),
    createDirectories: async (path) => {
      await mkdir(path, { recursive: true, mode: 0o700 });
    },
    createDirectory,
    copyFile,
    renameFile: rename,
    removeFile: (path) => rm(path, { force: true, recursive: true }),
    writeFile,
    writeToDisk,
  },
};

// mkdir without recursive fails when the directory exists, so one call checks and claims it.
async function createDirectory(path: string): Promise<boolean> {
  try {
    await mkdir(path, { mode: 0o700 });

    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return false;
    }

    throw error;
  }
}

async function writeToDisk(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
