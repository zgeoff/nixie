import type { TasksContext } from './types';
import type { FailedTurnSpend } from './write-failed-turn-spend';
import { writeFailedTurnSpend } from './write-failed-turn-spend';

// A turn's records go in only with the write that fails here, so its spend goes in on its own. The
// caller acts on the write's error, so a failed spend write rides along as that error's cause.
export async function withTurnSpendOnFailure<T>(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  spend: FailedTurnSpend | null,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (spend !== null) {
      await writeFailedTurnSpend(context, spend).catch((spendError: unknown) => {
        if (error instanceof Error) {
          error.cause =
            error.cause === undefined
              ? spendError
              : new AggregateError([error.cause, spendError], "the turn's spend went unrecorded");
        }
      });
    }

    throw error;
  }
}
