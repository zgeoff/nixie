import { closeSync, existsSync, openSync, rmSync } from 'node:fs';

export type OutputReservation = { file: number; release: () => void } | { refused: 'exists' | 'held' };

// Reserves a run's output path for one run at a time. The lock file beside it is created with the
// exclusive flag, so of two runs that start together exactly one takes it, and only that run checks
// for an earlier run's file and then creates or empties it. A file that holds a run stays unless
// replace is set.
export function reserveOutput(path: string, replace: boolean): OutputReservation {
  const lockPath = `${path}.lock`;
  let lock: number;
  try {
    lock = openSync(lockPath, 'wx');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return { refused: 'held' };
    }
    throw error;
  }
  const releaseLock = (): void => {
    closeSync(lock);
    rmSync(lockPath, { force: true });
  };
  if (existsSync(path) && !replace) {
    releaseLock();
    return { refused: 'exists' };
  }
  const file = openSync(path, 'w');
  return {
    file,
    release: () => {
      closeSync(file);
      releaseLock();
    },
  };
}
