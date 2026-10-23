import { copyFile, mkdir, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
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
    readDirectory: (path) => readdir(path),
    copyFile: (from, to) => copyFile(from, to),
    renameFile: (from, to) => rename(from, to),
    removeFile: (path) => rm(path, { force: true, recursive: true }),
    writeFile: (path, text) => writeFile(path, text),
    writeToDisk,
  },
};

async function writeToDisk(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
