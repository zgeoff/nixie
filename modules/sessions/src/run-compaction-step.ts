import { runSessionCompaction } from '@heynixie/compaction';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { buildCompactionRequest } from './build-compaction-request';
import { runInboxStep } from './run-inbox-step';
import type { SessionStep } from './types';

// Compacts the session before the step takes the inbox. A summary commits with the boundary
// cleared, so the next turn opens a new session from it. A failure commits in its place, and the
// turn, when the inbox holds one, runs on the old session.
export async function runCompactionStep(
  step: SessionStep,
  boundary: SessionPoint,
): Promise<StepResult> {
  const outcome = await runSessionCompaction(
    step.run,
    buildCompactionRequest(step, {
      resume: boundary,
      trigger: 'threshold',
      contextSize: step.marks.lastContext?.size ?? null,
    }),
  );

  if (outcome.isSummarized || step.input.inbox.length === 0) {
    return {
      next: 'wait',
      records: [outcome.record],
      acknowledged: [],
      sessionBoundary: outcome.isSummarized ? null : step.input.sessionBoundary,
    };
  }

  return runInboxStep(step, { canCompact: false, before: [outcome.record] });
}
