import { runSessionCompaction } from '@heynixie/compaction';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { isToldWaitNotice } from '../inbox/is-told-wait-notice';
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

  // a wait notice that an earlier turn's opening told is no work for a turn
  const told = step.input.inbox.filter((record) => isToldWaitNotice(record, step.toldWaitNotices));

  const hasWork =
    step.input.inbox.length > told.length || isTaskWorkCut(step.run.frame, step.marks);

  if (outcome.isSummarized || !hasWork) {
    return {
      next: hasWork ? 'continue' : 'wait',
      records: [outcome.record],
      acknowledged: hasWork ? [] : told.map((record) => record.sequence),
      sessionBoundary: outcome.isSummarized ? null : step.input.sessionBoundary,
    };
  }

  return runInboxStep(step, { canCompact: false, before: [outcome.record] });
}
