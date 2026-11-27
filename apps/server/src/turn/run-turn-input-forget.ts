import type { SessionCleanupCause } from '@heynixie/sessions';
import { readCleanedTaskIDs } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';
import type { TurnInputs } from '@heynixie/turn-inputs';

// A note, a memory item, a moment and a connection forget on the erasure runner, which removes
// their turn inputs itself. Only a record forget is left.
type TurnInputForgetCause = Extract<SessionCleanupCause, { readonly recordSequence: number }>;

export interface TurnInputForgetOptions {
  readonly context: TasksContext;
  readonly turnInputs: Pick<TurnInputs, 'closeCaptures' | 'removeForgotten'>;
}

// Every forget ends every open capture first: a spool file on any thread may still be on its way,
// and a live capture key would take it in after the removal. It throws when a shred fails, so the
// forget fails with it and the start sequence runs it again.
export async function runTurnInputForget(
  options: TurnInputForgetOptions,
  cause: TurnInputForgetCause,
): Promise<void> {
  const cleaned = await readCleanedTaskIDs(options.context, cause);

  await options.turnInputs.closeCaptures({ cause: 'forget' });

  await options.turnInputs.removeForgotten({
    threads: cleaned,
    fromSequence: cause.recordSequence,
  });
}
