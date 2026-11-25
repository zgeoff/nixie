import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { TasksContext } from '../types';
import type { RunnerEndCause, RunnerEndContext } from './types';

type EndedHookContext = Pick<
  TasksContext,
  'clock' | 'definitions' | 'log' | 'queueRunnerActions' | 'runners'
>;

// Calls the `ended` hook of the runner that ran the task, after a stop, a close or a failure
// committed. A hook that fails changes nothing for the caller: the runner's own sweep does what the
// hook left undone.
export async function runEndedHook(
  context: EndedHookContext,
  taskID: string,
  cause: RunnerEndCause,
): Promise<void> {
  const resolution = await context.runners.resolve(context, taskID);

  if (resolution.status !== 'found' || resolution.definition.ended === null) {
    return;
  }

  try {
    await resolution.definition.ended(buildEndContext(context, taskID, cause), taskID, cause);
  } catch {
    // the runner's sweep takes the task up again
  }
}

function buildEndContext(
  context: EndedHookContext,
  taskID: string,
  cause: RunnerEndCause,
): RunnerEndContext {
  return {
    log: context.log,
    clock: context.clock,
    definitions: context.definitions,
    commit: (input) =>
      withWriteTransaction(context.log.writer, async (tx) => {
        await writeRecordsInTransaction(
          tx,
          context.log,
          input.records.map((record) => ({ ...record, thread: taskID })),
        );

        if (input.actions.length > 0) {
          invariant(
            context.queueRunnerActions,
            'an end that queues actions needs the actions queue',
          );

          await context.queueRunnerActions(tx, {
            taskID,
            stepKey: `ended:${cause}:${taskID}`,
            actions: input.actions,
          });
        }
      }),
  };
}
