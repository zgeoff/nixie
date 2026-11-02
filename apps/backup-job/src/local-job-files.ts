import { open, rename, writeFile } from 'node:fs/promises';
import type { ClaimFileLock } from '@heynixie/async';
import { claimFileLock, removeFile } from '@heynixie/async';
import type { BackupFileReads } from '@heynixie/wire';
import { localBackupFileReads } from '@heynixie/wire';

export interface JobFiles extends BackupFileReads {
  readonly writeFile: (path: string, text: string) => Promise<void>;
  readonly renameFile: (from: string, to: string) => Promise<void>;
  readonly writeToDisk: (path: string) => Promise<void>;
  readonly removeFile: (path: string) => Promise<void>;
  readonly claimFileLock: ClaimFileLock;
}

export const localJobFiles: JobFiles = {
  ...localBackupFileReads,
  writeFile: (path, text) => writeFile(path, text),
  renameFile: (from, to) => rename(from, to),
  writeToDisk,
  removeFile,
  claimFileLock,
};

async function writeToDisk(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
