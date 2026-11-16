import { readRunSince, readTaskBrief } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readRunTrigger } from '../task/read-run-trigger';
import { isRunBlocksTurn, renderRunBlocks } from '../task/render-run-blocks';
import { pickTurnInbox } from '../turn/pick-turn-inbox';
import { readTurnContext } from '../turn/read-turn-context';
import type { SessionTurn } from '../turn/run-planned-turn';
import type { SessionStart, SessionStep } from '../types';
import { isTaskWorkCut } from '../utils/is-task-work-cut';
import { pickBriefPlace } from './pick-brief-place';

// `start` is how the session that the turn opens starts, or null for a turn that resumes one.
export async function readSessionTurn(
  step: SessionStep,
  start: SessionStart | null,
): Promise<SessionTurn> {
  const isNewSession = start !== null;

  // The conversation and the other fixed tasks have no brief.
  const brief =
    step.run.frame.kind === 'task'
      ? await readTaskBrief(step.run.context, step.input.taskID)
      : null;

  // A forget can invalidate a task before its first session opens, and the task still starts.
  const isFirstSession = step.marks.sessionKey === null;

  // The place is decided once, and the preamble and the opening both follow it.
  const briefPlace = pickBriefPlace({
    brief,
    run: step.input.run,
    stepKey: step.input.stepKey,
    start,
  });

  // A rebuilt or compacted session pins the blocks of the task run in its opening, beside the brief.
  const runBlocks = await readRunBlocks(step, isNewSession);

  const isPinned = start !== null && start.kind !== 'first';

  const context = await readTurnContext(step.run, {
    taskID: step.input.taskID,
    persona: step.definitions.persona,
    prompts: step.definitions.prompts,
    skillCatalog: step.skillCatalog,
    batch: pickTurnInbox(step.input.inbox),
    brief,
    briefPlace,
    report: step.input.run?.opened.report ?? null,
    runBlocks: isPinned ? null : runBlocks,
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
    briefPlace,
    openingRunBlocks: isPinned ? runBlocks : null,
    isFirstSession,
    context,
  };
}

async function readRunBlocks(step: SessionStep, isNewSession: boolean): Promise<string | null> {
  const run = step.input.run;

  if (run === null) {
    return null;
  }

  const turn = { stepKey: step.input.stepKey, isNewSession };

  // a later step of a session that holds the blocks reads nothing
  if (!isRunBlocksTurn(run, turn)) {
    return null;
  }

  const trigger = await readRunTrigger(step.run, run);
  const since = await readRunSince(step.run.context, run);

  return renderRunBlocks(run, turn, trigger, since);
}

// a session resumes only after its opening, which keeps or gives its key
function getResumedKey(step: SessionStep): string {
  const key = step.marks.sessionKey;

  invariant(key !== null, 'a resumed session has no opening');

  return key;
}
