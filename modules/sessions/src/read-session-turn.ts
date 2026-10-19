import { inboxBatchLimit } from './inbox-batch-limit';
import { readTurnContext } from './read-turn-context';
import type { SessionTurn } from './run-planned-turn';
import type { SessionStep } from './types';

// Reads what the step's turn adds to the session: the memory context for its batch of the inbox.
// A new session holds no item yet, so its retrieval leaves none out.
export async function readSessionTurn(
  step: SessionStep,
  isNewSession: boolean,
): Promise<SessionTurn> {
  const context = await readTurnContext(step.run, {
    taskID: step.input.taskID,
    persona: step.definitions.persona,
    skillCatalog: step.skillCatalog,
    batch: step.input.inbox.slice(0, inboxBatchLimit),
    previousCore: step.marks.previousCore,
    isNewSession,
  });

  return {
    run: step.run,
    input: step.input,
    definitions: step.definitions,
    signal: step.signal,
    invalidatedThrough: step.marks.invalidatedThrough,
    images: isNewSession ? { bytes: 0, count: 0 } : step.marks.images,
    context,
  };
}
