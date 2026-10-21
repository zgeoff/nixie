import { runSessionCompaction } from '@heynixie/compaction';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { buildCompactionRequest } from './build-compaction-request';
import { runInboxStep } from './run-inbox-step';
import type { SessionStep } from './types';

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
