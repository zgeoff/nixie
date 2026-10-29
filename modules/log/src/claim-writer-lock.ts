import type { ClaimFileLock } from '@heynixie/async';
import { claimFileLock } from '@heynixie/async';
import type { WriterLock } from './types';
import { WriterLockHeldError } from './writer-lock-held-error';

// The lock sits on the data directory, never on nixie.db: closing any descriptor on nixie.db drops
// every POSIX lock the process holds on that file, SQLite's included.
export function claimWriterLock(
  dataDir: string,
  claimLock: ClaimFileLock = claimFileLock,
): WriterLock {
  const lock = claimLock(dataDir, 'exclusive');

  if (lock === null) {
    throw new WriterLockHeldError();
  }

  return lock;
}
