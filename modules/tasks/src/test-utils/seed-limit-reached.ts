import { withWriteTransaction } from '@heynixie/log';
import { writeTaskLimitHoldInTransaction } from '../task/limit/write-task-limit-hold-in-transaction';
import type { TasksContext } from '../types';

export interface LimitReachedSeed {
  readonly taskID: string;
  readonly stepKey: string;
}

// A task that met its limit and nothing has raised it, with its state left as it was.
export function seedLimitReached(context: TasksContext, seed: LimitReachedSeed): Promise<void> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeTaskLimitHoldInTransaction(tx, context, seed.taskID, {
      kind: 'reach',
      stepKey: seed.stepKey,
      used: { turns: 1, dollars: 0.1 },
      limits: { turns: 1, dollars: 2 },
    }),
  );
}
