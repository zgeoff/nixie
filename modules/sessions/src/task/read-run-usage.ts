import { withWriteTransaction } from '@heynixie/log';
import type { TaskLimits, TaskRun, TasksContext } from '@heynixie/tasks';
import { readRunMeters, toTransactionContext } from '@heynixie/tasks';

export interface RunUsageRead {
  readonly used: TaskLimits;
}

// Every meter read in one transaction, so a record that lands during the read counts in all of them
// or in none.
export function readRunUsage(
  context: Pick<TasksContext, 'log' | 'runSettings' | 'runners'>,
  run: TaskRun,
): Promise<RunUsageRead> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const inTransaction = toTransactionContext(context, tx);
    const used = { turns: 0, dollars: 0 };

    for (const meter of await readRunMeters(inTransaction, run.taskID)) {
      used[meter.name] = await meter.read(inTransaction, run);
    }

    return { used };
  });
}
