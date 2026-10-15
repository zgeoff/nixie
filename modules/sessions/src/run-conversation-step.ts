import { isCompactionDue } from '@heynixie/compaction';
import type { StepInput, StepResult } from '@heynixie/tasks';
import { parseSessionBoundary } from './parse-session-boundary';
import { readSessionMarks } from './read-session-marks';
import { runCompactionStep } from './run-compaction-step';
import { runInboxStep } from './run-inbox-step';
import type { ConversationRun } from './types';

// Runs one step of the conversation. A session whose last turn ended past the compaction threshold
// compacts before the step takes the inbox; any other step with an unread record runs a turn.
export function runConversationStep(run: ConversationRun, input: StepInput): Promise<StepResult> {
  return run.session.withTurn(async (invalidated) => {
    const signal = AbortSignal.any([input.signal, invalidated]);

    const marks = await readSessionMarks(run.context, input.taskID);

    const boundary = parseSessionBoundary(input.sessionBoundary);
    const step = { run, input, signal, marks };
    const isResumable = boundary !== null && !marks.isInvalidated && marks.hasOpening;

    if (isResumable && isCompactionDue(marks.lastContext, run.compaction.threshold)) {
      return runCompactionStep(step, boundary);
    }

    if (input.inbox.length === 0) {
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
