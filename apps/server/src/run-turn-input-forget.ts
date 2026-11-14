import { readForgetFloor } from '@heynixie/memory';
import type { SessionCleanupCause } from '@heynixie/sessions';
import { readCleanedTaskIDs } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { ForgetScope, TurnInputs } from '@heynixie/turn-inputs';

export interface TurnInputForgetOptions {
  readonly context: TasksContext;
  readonly turnInputs: Pick<TurnInputs, 'closeCaptures' | 'removeForgotten'>;
}

// A record forget ends every open capture. A memory or moment forget ends the captures of the
// conversation thread and the tasks it covers. Then it removes the requests it covers. It
// throws when a shred fails, so the forget fails with it and the start sequence runs it again.
export async function runTurnInputForget(
  options: TurnInputForgetOptions,
  cause: SessionCleanupCause,
): Promise<void> {
  const cleaned = await readCleanedTaskIDs(options.context, cause);

  if ('recordSequence' in cause) {
    await options.turnInputs.closeCaptures({ cause: 'forget' });
  } else {
    await options.turnInputs.closeCaptures({
      cause: 'forget',
      taskIDs: [conversationTaskID, ...cleaned],
    });
  }

  const threads = 'recordSequence' in cause ? cleaned : [conversationTaskID, ...cleaned];

  const scope = await readForgetScope(options.context, cause, threads);

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
