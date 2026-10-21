import { runSessionCompaction } from '@heynixie/compaction';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { buildCompactionRequest } from './build-compaction-request';
import type { InboxPlan, SessionStep } from './types';
import { writeCompactionFailures } from './write-compaction-failures';

interface OverflowedTurn {
  readonly plan: InboxPlan;
  readonly resume: SessionPoint;
  readonly contextSize: number | null;
}

export async function runOverflowCompaction(
  step: SessionStep,
  overflow: OverflowedTurn,
): Promise<StepResult> {
  if (!overflow.plan.canCompact) {
    await writeCompactionFailures(step, overflow.plan.before);

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
    await writeCompactionFailures(step, [...overflow.plan.before, outcome.record]);

    throw new Error('the conversation turn passed the context window, and its compaction failed');
  }

  return {
    next: 'wait',
    records: [...overflow.plan.before, outcome.record],
    acknowledged: [],
    sessionBoundary: null,
  };
}
