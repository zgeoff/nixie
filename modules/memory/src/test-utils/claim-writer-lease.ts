import type { Lease, TasksContext } from '@heynixie/tasks';
import { claimLease } from '@heynixie/tasks';
import { memoryWriterTaskID } from '../memory-writer-task-id';

// Claims the memory writer's task lease for an hour, as the runner that runs a writer step holds
// it, and throws when another holder already has it.
export async function claimWriterLease(
  context: Pick<TasksContext, 'clock' | 'log'>,
): Promise<Lease> {
  const lease = await claimLease(context, {
    kind: 'task',
    holder: 'runner-1',
    durationMs: 3_600_000,
    findCandidate: () => Promise.resolve(memoryWriterTaskID),
  });

  if (lease === null) {
    throw new Error("another holder has the memory writer's lease");
  }
  return lease;
}
