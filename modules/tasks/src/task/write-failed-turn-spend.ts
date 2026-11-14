import { writeRecords } from '@heynixie/log';
import type { TasksContext } from '../types';
import { taskFailedTurnSpentCodec } from './codec/task-failed-turn-spent-codec';

export interface FailedTurnSpend {
  readonly taskID: string;
  readonly dollars: number;

  // the open task run that the turn spent for
  readonly taskRunID?: string;
}

// The calls spent the dollars whoever holds the task's lease now, so the write checks no lease: a
// step that lost its lease still counts what its turn spent, whether the turn failed or its commit
// never landed.
export async function writeFailedTurnSpend(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  spend: FailedTurnSpend,
): Promise<void> {
  await writeRecords(context.log, [
    {
      kind: taskFailedTurnSpentCodec.kind,
      definitions: context.definitions(),
      thread: spend.taskID,
      payload: taskFailedTurnSpentCodec.encode({
        taskID: spend.taskID,
        dollars: spend.dollars,
        ...(spend.taskRunID === undefined ? {} : { taskRunID: spend.taskRunID }),
      }),
    },
  ]);
}
