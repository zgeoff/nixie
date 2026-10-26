import { rm, writeFile } from 'node:fs/promises';
import type { LockFiles } from './create-run-lock.ts';

export const nodeLockFiles: LockFiles = {
  createExclusive: async (path, text) => {
    await writeFile(path, text, { flag: 'wx', mode: 0o600 });
  },
  remove: async (path) => {
    await rm(path, { force: true });
  },
};
