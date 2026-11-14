import { readForgetFloor } from '@heynixie/memory';
import type { SessionCleanupCause } from '@heynixie/sessions';
import { readCleanedTaskIDs } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';
import type { ForgetScope, TurnInputs } from '@heynixie/turn-inputs';

export interface TurnInputForgetOptions {
  readonly context: TasksContext;
  readonly turnInputs: Pick<TurnInputs, 'closeCaptures' | 'removeForgotten'>;
}

// A forget ends the captures of the tasks it covers, then removes the requests it covers. It
// throws when a shred fails, so the forget fails with it and the start sequence runs it again.
export async function runTurnInputForget(
  options: TurnInputForgetOptions,
  cause: SessionCleanupCause,
): Promise<void> {
  const taskIDs = await readCleanedTaskIDs(options.context, cause);

  await options.turnInputs.closeCaptures({ cause: 'forget', taskIDs });

  const scope = await readForgetScope(options.context, cause, taskIDs);

  await options.turnInputs.removeForgotten(scope);
}

// From the first record that can hold the forgotten text on, every request is covered. A forget
// that names no floor covers every request.
async function readForgetScope(
  context: TasksContext,
  cause: SessionCleanupCause,
  threads: readonly string[],
): Promise<ForgetScope> {
  if ('recordSequence' in cause) {
    return { threads, fromSequence: cause.recordSequence };
  }

  const floor = await readForgetFloor(context.log, cause);

  return { threads, fromSequence: floor };
}
