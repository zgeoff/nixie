import { basename } from 'node:path';
import type { DataStorage } from '@heynixie/log';

export type FailingStep = 'write' | 'fsync';

// A full disk or a failed fsync is a real failure that a test cannot cause on a test's own tmpfs, so
// the stand-in fails one step for every file with the given name and passes every other call on. A
// failed write leaves no file, as a full disk does when it refuses the file's creation.
export function buildStubFailingStorage(
  storage: DataStorage,
  failingName: string,
  failingStep: FailingStep,
): DataStorage {
  return {
    ...storage,
    files: {
      ...storage.files,
      writeFile: async (path, text) => {
        if (failingStep === 'write' && basename(path) === failingName) {
          throw new Error(`the stub fails the write of ${failingName}`);
        }

        await storage.files.writeFile(path, text);
      },
      writeFileToDisk: async (path) => {
        if (failingStep === 'fsync' && basename(path) === failingName) {
          throw new Error(`the stub fails the fsync of ${failingName}`);
        }

        await storage.files.writeFileToDisk(path);
      },
    },
  };
}
