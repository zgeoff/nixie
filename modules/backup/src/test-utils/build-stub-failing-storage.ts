import { basename } from 'node:path';
import type { DataStorage } from '@heynixie/log';

// A full disk or a failed fsync is a real failure that a test cannot cause on a test's own tmpfs, so
// the stand-in fails the fsync of every file with the given name and passes every other call on.
export function buildStubFailingStorage(storage: DataStorage, failingName: string): DataStorage {
  return {
    ...storage,
    files: {
      ...storage.files,
      writeFileToDisk: async (path) => {
        if (basename(path) === failingName) {
          throw new Error(`the stub fails the fsync of ${failingName}`);
        }

        await storage.files.writeFileToDisk(path);
      },
    },
  };
}
