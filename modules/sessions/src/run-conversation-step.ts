import type { StepInput, StepResult } from '@heynixie/tasks';
import { readTaskDirectory } from '@heynixie/tasks';
import { canSessionTake } from './can-session-take';
import { isSessionLive } from './is-session-live';
import { parseSessionBoundary } from './parse-session-boundary';
import { pickSessionPosition } from './pick-session-position';
import type { SessionMarks } from './read-session-marks';
import { readSessionMarks } from './read-session-marks';
import { runCompactionStep } from './run-compaction-step';
import { runInboxStep } from './run-inbox-step';
import type { ConversationRun, SessionFrame } from './types';

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

    if (isSessionLive(position) && canSessionTake(position.state, 'compact')) {
      return runCompactionStep(step, position.boundary);
    }

    if (input.inbox.length === 0 && !isTaskStart(run.frame, marks)) {
      return {
        next: 'wait',
        records: [],
        acknowledged: [],
        sessionBoundary: input.sessionBoundary,
      };
    }

    return runInboxStep(step, { canCompact: true, before: [] });
  });
}

// A started task's brief is its first piece of work, and it arrives in no inbox record. A forget can
// invalidate the task before its first session opens, so the test is the opening and not the state.
function isTaskStart(frame: SessionFrame, marks: SessionMarks): boolean {
  return frame.kind === 'task' && marks.sessionKey === null;
}
