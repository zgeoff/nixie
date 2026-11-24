import type { TaskGate, TasksContext } from '../types';
import { readTaskGate } from './read-task-gate';

// The gate in a read transaction of its own, for a caller that guards no write, such as a step
// that is about to start its turn.
export function readTaskGateSnapshot(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<TaskGate> {
  return context.log.writer.db.transaction().execute((tx) => readTaskGate(tx, taskID));
}
