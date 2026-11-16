import { readRecords } from '@heynixie/log';
import type { TaskLimits, TaskRun, TasksContext } from '@heynixie/tasks';

export interface RunUsageRead {
  readonly used: TaskLimits;

  // the sequence of the newest record of the task when the read began, or 0 when it has none
  readonly throughSequence: number;
}

// The newest sequence is read first, so a record that lands during the meters' read counts in the
// late spend after it as well, which only shortens the turn.
export async function readRunUsage(
  context: Pick<TasksContext, 'log' | 'runSettings' | 'runners'>,
  run: TaskRun,
): Promise<RunUsageRead> {
  const [newest] = await readRecords(context.log, {
    afterSequence: 0,
    thread: run.taskID,
    order: 'newest',
    limit: 1,
  });

  const used = { turns: 0, dollars: 0 };

  for (const meter of context.runSettings.meters) {
    used[meter.name] = await meter.read(context, run);
  }

  return { used, throughSequence: newest?.record.sequence ?? 0 };
}
