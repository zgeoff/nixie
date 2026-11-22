import { readForgetFloor } from '@heynixie/memory';
import { readNoteForgetFloor } from '@heynixie/notebook';
import type { SessionCleanupCause } from '@heynixie/sessions';
import { readCleanedTaskIDs } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { ForgetScope, TurnInputs } from '@heynixie/turn-inputs';

export interface TurnInputForgetOptions {
  readonly context: TasksContext;
  readonly turnInputs: Pick<TurnInputs, 'closeCaptures' | 'removeForgotten'>;
}

// Every forget ends every open capture first: a spool file on any thread may still be on its way,
// and a live capture key would take it in after the removal. It throws when a shred fails, so the
// forget fails with it and the start sequence runs it again.
export async function runTurnInputForget(
  options: TurnInputForgetOptions,
  cause: SessionCleanupCause,
): Promise<void> {
  const cleaned = await readCleanedTaskIDs(options.context, cause);

  await options.turnInputs.closeCaptures({ cause: 'forget' });

  const threads = pickForgetThreads(cause, cleaned);

  const scope = await readForgetScope(options.context, cause, threads);

  await options.turnInputs.removeForgotten(scope);
}

// A note sits on no thread, so its forget names none and starts at the note's first record. A record
// forget covers the threads of the sessions it cleaned, and any other forget the conversation too.
function pickForgetThreads(
  cause: SessionCleanupCause,
  cleaned: readonly string[],
): readonly string[] {
  if ('noteID' in cause) {
    return [];
  }

  return 'recordSequence' in cause ? cleaned : [conversationTaskID, ...cleaned];
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

  if ('noteID' in cause) {
    return { threads, fromSequence: await readNoteForgetFloor(context.log, cause.noteID) };
  }

  const floor = await readForgetFloor(context.log, cause);

  return { threads, fromSequence: floor };
}
