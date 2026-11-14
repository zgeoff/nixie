import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';

export async function readRecalledThrough(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  beforeSequence?: number,
): Promise<number> {
  const [newest] = await readRecords(context.log, {
    afterSequence: 0,
    ...(beforeSequence === undefined ? {} : { beforeSequence }),
    thread: taskID,
    kinds: ['memory.recalled'],
    order: 'newest',
    limit: 1,
  });

  return newest?.record.sequence ?? 0;
}
