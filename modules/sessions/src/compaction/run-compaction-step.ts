import { runSessionCompaction } from '@heynixie/compaction';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { runInboxStep } from '../inbox/run-inbox-step';
import type { SessionStep } from '../types';
import { isTaskWorkCut } from '../utils/is-task-work-cut';
import { buildCompactionRequest } from './build-compaction-request';

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

  const hasWork = step.input.inbox.length > 0 || isTaskWorkCut(step.run.frame, step.marks);

  if (outcome.isSummarized || !hasWork) {
    return {
      next: hasWork ? 'continue' : 'wait',
      records: [outcome.record],
      acknowledged: [],
      sessionBoundary: outcome.isSummarized ? null : step.input.sessionBoundary,
    };
  }

  return runInboxStep(step, { canCompact: false, before: [outcome.record] });
}
