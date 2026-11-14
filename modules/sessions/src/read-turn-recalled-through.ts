import { readRecords } from '@heynixie/log';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import { readRecalledThrough } from './read-recalled-through';

// A recall counts as held only when its result comes before the point the turn ends at, and the
// result of a recall that finishes after an interrupt never reaches the model.
export async function readTurnRecalledThrough(
  context: Pick<TasksContext, 'log'>,
  input: Pick<StepInput, 'taskID' | 'stepKey'>,
): Promise<number> {
  const interrupts = await readRecords(context.log, {
    afterSequence: 0,
    thread: input.taskID,
    kinds: ['task.interrupted'],
    order: 'newest',
    limit: 5,
  });

  const interrupt = interrupts.find((entry) => entry.record.payload['stepKey'] === input.stepKey);
  const interruptedAt = interrupt?.record.sequence;

  return readRecalledThrough(context, input.taskID, interruptedAt);
}
