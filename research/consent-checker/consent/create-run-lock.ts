export interface LockFiles {
  createExclusive: (path: string, text: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
}

export interface RunLock {
  remove: () => Promise<void>;
}

// Each run file gets a lock file beside it, made with an exclusive create, so a second label or check
// run on the same files stops before it reads their spend or their done records. A run that crashes
// leaves its lock files behind, and the error names them.
export async function createRunLock(paths: readonly string[], files: LockFiles): Promise<RunLock> {
  const held: string[] = [];

  const remove = async (): Promise<void> => {
    await Promise.all(held.map((lockPath) => files.remove(lockPath)));
  };

  for (const lockPath of [...new Set(paths)].toSorted().map((path) => `${path}.lock`)) {
    try {
      await files.createExclusive(lockPath, `${process.pid}\n`);

      held.push(lockPath);
    } catch (error) {
      if (isAlreadyHeld(error)) {
        await remove();

        throw new Error(
          `${lockPath} exists, so another label or check run holds these files; remove it only when no run is going`,
          { cause: error },
        );
      }

      // An exclusive create can make the file and then fail its write, which leaves a lock that no
      // run holds.
      held.push(lockPath);

      await remove();

      throw error;
    }
  }

  return { remove };
}

function isAlreadyHeld(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}
