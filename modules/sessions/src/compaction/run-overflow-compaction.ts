import { runSessionCompaction } from '@heynixie/compaction';
import type { RecordInput } from '@heynixie/log';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import type { InboxPlan, SessionStep } from '../types';
import type { DroppedReplies } from '../utils/build-reply-voids';
import { buildReplyVoids } from '../utils/build-reply-voids';
import { isTaskWorkCut } from '../utils/is-task-work-cut';
import { buildCompactionRequest } from './build-compaction-request';
import { writeCompactionFailures } from './write-compaction-failures';

interface OverflowedTurn {
  readonly plan: InboxPlan;
  readonly resume: SessionPoint;
  readonly contextSize: number | null;

  // the replies the overflowed turn wrote live, which the compaction replaces
  readonly replies: DroppedReplies;
}

export async function runOverflowCompaction(
  step: SessionStep,
  overflow: OverflowedTurn,
): Promise<StepResult> {
  if (!overflow.plan.canCompact) {
    await writeCompactionFailures(step, [
      ...overflow.plan.before,
      ...buildFailedVoids(step, overflow),
    ]);

    throw new Error('the conversation turn passed the context window after a failed compaction');
  }

  const outcome = await runSessionCompaction(
    step.run,
    buildCompactionRequest(step, {
      resume: overflow.resume,
      trigger: 'overflow',
      contextSize: overflow.contextSize,
    }),
  );

  if (!outcome.isSummarized) {
    await writeCompactionFailures(step, [
      ...overflow.plan.before,
      outcome.record,
      ...buildFailedVoids(step, overflow),
    ]);

    throw new Error('the conversation turn passed the context window, and its compaction failed');
  }

  return {
    next: isTaskWorkCut(step.run.frame, step.marks) ? 'continue' : 'wait',
    records: [
      ...overflow.plan.before,
      outcome.record,
      ...buildReplyVoids(step.run.context, { ...overflow.replies, reason: 'turn_dropped' }),
    ],
    acknowledged: [],
    sessionBoundary: null,
  };
}

function buildFailedVoids(step: SessionStep, overflow: OverflowedTurn): readonly RecordInput[] {
  return buildReplyVoids(step.run.context, { ...overflow.replies, reason: 'attempt_failed' });
}
