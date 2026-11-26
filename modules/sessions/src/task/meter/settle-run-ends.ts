import { toErrorFields } from '@heynixie/logger';
import type { RunEndDeps } from './settle-run-end';
import { settleRunEnd } from './settle-run-end';

// Writes the end read of each task's newest ended task run, and returns the tasks whose read did not
// succeed.
export async function settleRunEnds(
  deps: RunEndDeps,
  taskIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  const waiting = new Set<string>();

  for (const taskID of taskIDs) {
    try {
      const settlement = await settleRunEnd(deps, taskID);

      if (settlement === 'waiting') {
        waiting.add(taskID);
      }
    } catch (error) {
      waiting.add(taskID);
      deps.logger('sandbox_runner.run_end_failed', { taskID, ...toErrorFields(error) }, 'error');
    }
  }

  return waiting;
}
