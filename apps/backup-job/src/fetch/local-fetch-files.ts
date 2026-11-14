import { mkdir, readdir } from 'node:fs/promises';
import { removeFile } from '@heynixie/async';
import { localJobFiles } from '../local-job-files';
import type { FetchFiles } from './run-backup-fetch';

export const localFetchFiles: FetchFiles = {
  writeFile: localJobFiles.writeFile,
  removeFile,
  createDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  readDirectory: async (path) => {
    try {
      return await readdir(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  },
};
