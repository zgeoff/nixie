import invariant from 'tiny-invariant';
import { inboxBatchLimit } from './inbox-batch-limit';
import { readTurnContext } from './read-turn-context';
import type { SessionTurn } from './run-planned-turn';
import type { SessionStep } from './types';

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
    sessionKey: isNewSession ? crypto.randomUUID() : getResumedKey(step),
    context,
  };
}

// a session resumes only after its opening, which keeps or gives its key
function getResumedKey(step: SessionStep): string {
  const key = step.marks.sessionKey;

  invariant(key !== null, 'a resumed session has no opening');

  return key;
}
