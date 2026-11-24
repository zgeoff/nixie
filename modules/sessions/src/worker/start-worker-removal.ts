import { toErrorFields } from '@heynixie/logger';
import type { Sandbox } from '@heynixie/sandbox';
import type { WorkerDeps } from './types';

type RemovalDeps = Pick<WorkerDeps, 'failedDestroys' | 'cleanups' | 'logger'>;

// Destroys a worker's sandbox after the call has its result, and frees the worker's slot when the
// destroy ends, whether it worked or not. A sandbox that stays goes on the list that the next worker
// run tries again before its create, and the restart sweep removes whatever a restart leaves.
export function startWorkerRemoval(deps: RemovalDeps, sandbox: Sandbox, release: () => void): void {
  const removed = Promise.withResolvers<void>();

  deps.cleanups.add(removed.promise);

  const remove = async (): Promise<void> => {
    try {
      await removeWorkerSandbox(deps, sandbox, release);
    } finally {
      deps.cleanups.delete(removed.promise);
      removed.resolve();
    }
  };

  void remove();
}

async function removeWorkerSandbox(
  deps: RemovalDeps,
  sandbox: Sandbox,
  release: () => void,
): Promise<void> {
  try {
    await sandbox.destroy();
  } catch (error) {
    deps.failedDestroys.push(sandbox);

    deps.logger(
      'worker.destroy_failed',
      { sandboxID: sandbox.id, ...toErrorFields(error) },
      'error',
    );
  } finally {
    release();
  }
}
