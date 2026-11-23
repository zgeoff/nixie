import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { sessionResetKinds } from './session-reset-kinds';

// The sequence of the newest record that reset the thread's session, or 0 when none did. What the
// thread wrote after it, the session holds.
export async function readSessionStart(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<number> {
  const [reset] = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: sessionResetKinds,
    order: 'newest',
    limit: 1,
  });

  return reset?.record.sequence ?? 0;
}
