import { removeSandboxes } from '@heynixie/sandbox';
import type { SandboxRunnerOptions } from './sandbox-runner-options';

// Destroys the sandboxes of an ended task and returns how many went. One that fails to go is
// logged and the rest still go. The throw keeps the task in the next sweep and in the next start's
// restart sweep, which destroy what is left.
export async function removeTaskSandboxes(
  options: Pick<SandboxRunnerOptions, 'log' | 'sandboxes'>,
  taskID: string,
): Promise<number> {
  const sandboxes = await options.sandboxes.list(taskID);
  const outcome = await removeSandboxes(sandboxes, options.log);

  if (outcome.failed.length > 0) {
    throw new Error(`${outcome.failed.length} of the task's sandboxes did not go`);
  }

  return outcome.removed.length;
}
