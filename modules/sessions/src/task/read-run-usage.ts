import { readRecords, withWriteTransaction } from '@heynixie/log';
import type { TaskLimits, TaskRun, TasksContext } from '@heynixie/tasks';
import { readRunMeters, toTransactionContext } from '@heynixie/tasks';

export interface RunUsageRead {
  readonly used: TaskLimits;

  // the sequence of the newest record of the task in the same snapshot as the meters, or 0 when it
  // has none
  readonly throughSequence: number;
}

// The newest sequence and the meters read in one transaction, so a record that lands during the read
// counts in the meters or in the late spend after it, never in both and never in neither.
export function readRunUsage(
  context: Pick<TasksContext, 'log' | 'runSettings' | 'runners'>,
  run: TaskRun,
): Promise<RunUsageRead> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const inTransaction = toTransactionContext(context, tx);

    const [newest] = await readRecords(inTransaction.log, {
      afterSequence: 0,
      thread: run.taskID,
      order: 'newest',
      limit: 1,
    });

    const used = { turns: 0, dollars: 0 };

    for (const meter of await readRunMeters(inTransaction, run.taskID)) {
      used[meter.name] = await meter.read(inTransaction, run);
    }

    return { used, throughSequence: newest?.record.sequence ?? 0 };
  });
}
