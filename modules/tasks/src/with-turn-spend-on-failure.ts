import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { TasksContext } from './types';
import type { FailedTurnSpend } from './write-failed-turn-spend';
import { writeFailedTurnSpend } from './write-failed-turn-spend';

export interface TurnSpendGuard {
  readonly spend: FailedTurnSpend | null;
  readonly logger: Logger;
}

// A turn's records go in only with the write that fails here, so its spend goes in on its own. The
// caller acts on the write's error, often by dropping a lost lease, so a failed spend write logs.
export async function withTurnSpendOnFailure<T>(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  guard: TurnSpendGuard,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const spend = guard.spend;

    if (spend !== null) {
      await writeFailedTurnSpend(context, spend).catch((spendError: unknown) => {
        guard.logger(
          'task.turn_spend_unrecorded',
          { taskID: spend.taskID, dollars: spend.dollars, ...toErrorFields(spendError) },
          'error',
        );
      });
    }

    throw error;
  }
}
