import { readTaskBrief } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { renderRunBlocks } from '../task/render-run-blocks';
import { pickTurnInbox } from '../turn/pick-turn-inbox';
import { readTurnContext } from '../turn/read-turn-context';
import type { SessionTurn } from '../turn/run-planned-turn';
import type { SessionStep } from '../types';
import { isTaskWorkCut } from '../utils/is-task-work-cut';

export async function readSessionTurn(
  step: SessionStep,
  isNewSession: boolean,
): Promise<SessionTurn> {
  // The conversation and the other fixed tasks have no brief.
  const brief =
    step.run.frame.kind === 'task'
      ? await readTaskBrief(step.run.context, step.input.taskID)
      : null;

  // A forget can invalidate a task before its first session opens, and the task still starts.
  const isFirstSession = step.marks.sessionKey === null;

  const context = await readTurnContext(step.run, {
    taskID: step.input.taskID,
    persona: step.definitions.persona,
    prompts: step.definitions.prompts,
    skillCatalog: step.skillCatalog,
    batch: pickTurnInbox(step.input.inbox),
    brief,
    runBlocks: pickRunBlocks(step, isNewSession),
    previousCore: step.marks.previousCore,
    isNewSession,

    isFirstSession,

    isContinuation: step.input.inbox.length === 0 && isTaskWorkCut(step.run.frame, step.marks),
  });

  return {
    run: step.run,
    input: step.input,
    definitions: step.definitions,
    signal: step.signal,
    invalidatedThrough: step.marks.invalidatedThrough,
    images: isNewSession ? { bytes: 0, count: 0 } : step.marks.images,
    sessionKey: isNewSession ? crypto.randomUUID() : getResumedKey(step),
    brief,
    isFirstSession,
    context,
  };
}

function pickRunBlocks(step: SessionStep, isNewSession: boolean): string | null {
  return step.input.run === null
    ? null
    : renderRunBlocks(step.input.run, { stepKey: step.input.stepKey, isNewSession });
}

// a session resumes only after its opening, which keeps or gives its key
function getResumedKey(step: SessionStep): string {
  const key = step.marks.sessionKey;

  invariant(key !== null, 'a resumed session has no opening');

  return key;
}
