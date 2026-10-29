import { open, rename, rm, writeFile } from 'node:fs/promises';

export interface JobFiles {
  readonly writeFile: (path: string, text: string) => Promise<void>;
  readonly renameFile: (from: string, to: string) => Promise<void>;
  readonly writeToDisk: (path: string) => Promise<void>;
  readonly removeFile: (path: string) => Promise<void>;
}

export const localJobFiles: JobFiles = {
  writeFile: (path, text) => writeFile(path, text),
  renameFile: (from, to) => rename(from, to),
  writeToDisk,
  removeFile: (path) => rm(path, { force: true }),
};

async function writeToDisk(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
