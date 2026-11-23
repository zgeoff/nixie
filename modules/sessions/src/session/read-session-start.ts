import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { sessionResetKinds } from './session-reset-kinds';

// The sequence after which the thread's writes belong to the session, or 0 with no turn ended
// before the newest reset. The opening record commits after the opening turn's writes, so the start
// is the end of the turn before it.
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

  if (reset === undefined) {
    return 0;
  }

  const [ended] = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence: reset.record.sequence,
    thread: taskID,
    kinds: ['model.turn_ended'],
    order: 'newest',
    limit: 1,
  });

  return ended?.record.sequence ?? 0;
}
