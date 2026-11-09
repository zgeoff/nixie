import type { StepInput, StepResult } from '@heynixie/tasks';
import { readTaskDirectory } from '@heynixie/tasks';
import { canSessionTake } from './can-session-take';
import { isSessionLive } from './is-session-live';
import { isStepTurnCut } from './is-step-turn-cut';
import { isTaskWorkCut } from './is-task-work-cut';
import { parseSessionBoundary } from './parse-session-boundary';
import { pickSessionPosition } from './pick-session-position';
import type { SessionMarks } from './read-session-marks';
import { readSessionMarks } from './read-session-marks';
import { runCompactionStep } from './run-compaction-step';
import { runInboxStep } from './run-inbox-step';
import type { ConversationRun, SessionFrame, SessionStep } from './types';

export function runConversationStep(
  conversation: ConversationRun,
  input: StepInput,
): Promise<StepResult> {
  return conversation.session.withTurn(async (invalidated) => {
    const signal = AbortSignal.any([input.signal, invalidated]);
    const definitions = conversation.getDefinitions();

    const run = {
      ...conversation,
      messaging: await readTaskDirectory(conversation.context, conversation.messaging),
    };

    const marks = await readSessionMarks(run.context, input.taskID);
    const catalog = await run.loadOrPinSkillCatalog?.(input.taskID);

    const skillCatalog = catalog ?? null;

    const position = pickSessionPosition({
      marks,
      personaHash: definitions.personaHash,
      boundary: parseSessionBoundary(input.sessionBoundary),
      threshold: run.compaction.threshold,
    });

    const step = { run, input, signal, definitions, skillCatalog, marks, position };

    const result = await runSessionStep(step);

    // A started task keeps the work that an interrupt cut, so its resume or its raise runs that
    // work on with no new message.
    return run.frame.kind === 'task' && isStepTurnCut(input.interrupt, result.records)
      ? { ...result, next: 'continue' }
      : result;
  });
}

function runSessionStep(step: SessionStep): Promise<StepResult> {
  const frame = step.run.frame;

  if (isSessionLive(step.position) && canSessionTake(step.position.state, 'compact')) {
    return runCompactionStep(step, step.position.boundary);
  }

  if (
    step.input.inbox.length === 0 &&
    !isTaskStart(frame, step.marks) &&
    !isTaskWorkCut(frame, step.marks)
  ) {
    return Promise.resolve({
      next: 'wait',
      records: [],
      acknowledged: [],
      sessionBoundary: step.input.sessionBoundary,
    });
  }

  return runInboxStep(step, { canCompact: true, before: [] });
}

// A started task's brief is its first piece of work, and it arrives in no inbox record. A forget can
// invalidate the task before its first session opens, so the test is the opening and not the state.
function isTaskStart(frame: SessionFrame, marks: SessionMarks): boolean {
  return frame.kind === 'task' && marks.sessionKey === null;
}
