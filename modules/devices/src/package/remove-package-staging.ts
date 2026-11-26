import { rm } from 'node:fs/promises';

// Removes a staging folder that no move took, and does nothing for one that moved.
export function removePackageStaging(staging: string): Promise<void> {
  return rm(staging, { recursive: true, force: true });
}
