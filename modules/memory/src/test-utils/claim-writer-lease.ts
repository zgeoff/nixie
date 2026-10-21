import type { Lease, TasksContext } from '@heynixie/tasks';
import { claimLease } from '@heynixie/tasks';
import { memoryWriterTaskID } from '../memory-writer-task-id';

export async function claimWriterLease(
  context: Pick<TasksContext, 'clock' | 'log'>,
): Promise<Lease> {
  const lease = await claimLease(context, {
    kind: 'task',
    holder: 'runner-1',
    durationMs: 3_600_000,
    readCandidate: () => Promise.resolve(memoryWriterTaskID),
  });

  if (lease === null) {
    throw new Error("another holder has the memory writer's lease");
  }

  return lease;
}
