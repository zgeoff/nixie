import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext, TasksTables } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

// Fires every due timer that has not fired, earliest first, and returns how many fired. Its record
// holds the due time and the fire time, so a timer that fell due while nixie was down says so.
export async function runDueTimers(context: TasksContext): Promise<number> {
  const due = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('timers')
    .select(['timer_id', 'task_id', 'due_at'])
    .where('fired_at', 'is', null)
    .where('due_at', '<=', context.clock.now())
    .orderBy('due_at')
    .execute();
  const fired = { count: 0 };

  for (const timer of due) {
    // oxlint-disable-next-line no-await-in-loop -- each timer fires in its own transaction
    const didFire = await writeTimerFired(context, timer);

    fired.count += didFire ? 1 : 0;
  }
  return fired.count;
}

interface DueTimer {
  readonly timer_id: string;
  readonly task_id: string;
  readonly due_at: number;
}

// One timer's fire record, which lands in its task's inbox and wakes the task. The transaction
// checks the timer again, so a timer that another pass fired stays fired once.
async function writeTimerFired(context: TasksContext, timer: DueTimer): Promise<boolean> {
  const faultContext = { kind: 'task', id: timer.task_id } as const;

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('timer.fire.before', faultContext);
  }
  const didFire = await withWriteTransaction(context.log.writer, async (tx) => {
    const pending = await tx
      .$extendTables<TasksTables>()
      .selectFrom('timers')
      .select('timer_id')
      .where('timer_id', '=', timer.timer_id)
      .where('fired_at', 'is', null)
      .executeTakeFirst();

    if (pending === undefined) {
      return false;
    }
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'timer.fired',
        definitions: context.definitions(),
        thread: timer.task_id,
        payload: {
          timerID: timer.timer_id,
          taskID: timer.task_id,
          dueAt: timer.due_at,
          firedAt: context.clock.now(),
        },
      },
    ]);
    return true;
  });

  if (NIXIE_TEST_BUILD && didFire) {
    await waitAtFaultPoint('inbox.write.after', faultContext);
  }
  return didFire;
}
