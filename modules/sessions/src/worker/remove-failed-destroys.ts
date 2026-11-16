import { toErrorFields } from '@heynixie/logger';
import type { WorkerDeps } from './types';

// Tries each sandbox whose destroy failed again, before the next worker run's create. One that fails
// again stays on the list.
export async function removeFailedDestroys(
  deps: Pick<WorkerDeps, 'failedDestroys' | 'logger'>,
): Promise<void> {
  const failed = deps.failedDestroys.splice(0);

  for (const sandbox of failed) {
    try {
      await sandbox.destroy();
    } catch (error) {
      deps.failedDestroys.push(sandbox);

      deps.logger(
        'worker.destroy_failed',
        { sandboxID: sandbox.id, ...toErrorFields(error) },
        'error',
      );
    }
  }
}
