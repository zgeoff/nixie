import type { RecordInput } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { taskFailedTurnSpentCodec } from '@heynixie/tasks';

interface TurnSpend {
  readonly taskID: string;
  readonly taskRunID: string;
  readonly dollars: number;
}

// The budget's tally of a turn, which the turn's own record underprices when the turn was cut short.
export function buildSpendRecord(
  context: Pick<TasksContext, 'definitions'>,
  spend: TurnSpend,
): RecordInput {
  return {
    kind: taskFailedTurnSpentCodec.kind,
    definitions: context.definitions(),
    thread: spend.taskID,
    payload: taskFailedTurnSpentCodec.encode(spend),
  };
}
