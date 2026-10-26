import { open, rm } from 'node:fs/promises';

export interface RunLock {
  remove: () => Promise<void>;
}

// Each run file gets a lock file beside it, made with an exclusive create, so a second label or check
// run on the same files stops before it reads their spend or their done records. A run that crashes
// leaves its lock files behind, and the error names them.
export async function createRunLock(paths: readonly string[]): Promise<RunLock> {
  const held: string[] = [];

  const remove = async (): Promise<void> => {
    await Promise.all(held.map((lockPath) => rm(lockPath, { force: true })));
  };

  for (const lockPath of [...new Set(paths)].toSorted().map((path) => `${path}.lock`)) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);

      held.push(lockPath);

      await handle.writeFile(`${process.pid}\n`);
      await handle.close();
    } catch (error) {
      await remove();

      if (isAlreadyHeld(error)) {
        throw new Error(
          `${lockPath} exists, so another label or check run holds these files; remove it only when no run is going`,
          { cause: error },
        );
      }

      throw error;
    }
  }

  return { remove };
}

function isAlreadyHeld(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}
