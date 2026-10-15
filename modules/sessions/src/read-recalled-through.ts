import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';

// Reads the sequence of the thread's newest recall record, or 0 before its first. A turn reads it at
// each result it ends at, so its record keeps the last recall that came before its last result.
export async function readRecalledThrough(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<number> {
  const [newest] = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['memory.recalled'],
    order: 'newest',
    limit: 1,
  });

  return newest?.record.sequence ?? 0;
}
