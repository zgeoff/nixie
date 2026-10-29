import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { backupSetLayout } from '@heynixie/wire';
import type { JobFiles } from '../local-job-files';

// nixie records a receipt and removes its set once the receipt is in place, so the stand-in removes
// the set's directory straight after the rename that puts a receipt there, before the job's next
// step.
export function buildStubNixieCleanup(files: JobFiles): JobFiles {
  return {
    ...files,
    renameFile: async (from, to) => {
      await files.renameFile(from, to);

      if (basename(to) === backupSetLayout.receipt) {
        await rm(dirname(to), { recursive: true, force: true });
      }
    },
  };
}
