import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';

type RecoveredSandboxesOptions = Omit<StaleSandboxesOptions, 'log' | 'keptOwners'>;

// Recovery removes the sandboxes of every owner that no runner keeps and the checker does not own.
// A task that waits keeps its imp, so its next step resumes the same session. A worker's sandbox is
// owned by its run, which no runner keeps, so a restart removes it.
export async function removeRecoveredSandboxes(
  context: Pick<TasksContext, 'log' | 'runners'>,
  options: RecoveredSandboxesOptions,
): Promise<void> {
  const kept = await context.runners.readKeptSandboxOwners(context);

  await removeStaleSandboxes({ ...options, log: context.log, keptOwners: [checkerOwner, ...kept] });
}
