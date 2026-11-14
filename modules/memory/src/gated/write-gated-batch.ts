import type { StepResult } from '@heynixie/tasks';
import { pickBatchMode } from '../batch/pick-batch-mode';
import { tryWriteBatch } from '../batch/try-write-batch';
import { writeBatchPlan } from '../batch/write-batch-plan';
import type { GatedWrite } from '../memory/write-memory-batch';
import { planProposalCap } from '../proposal/plan-proposal-cap';
import type { WriterBatch } from '../writer/read-writer-batch';
import type { StagedFlag, WriterUsage } from '../writer/writer-model';
import type { WriterParts, WriterStepState } from '../writer/writer-parts';

export interface WriterBatchStep {
  readonly next: StepResult['next'];
  readonly timers: NonNullable<StepResult['timers']>;
}

interface GatedBatch extends WriterStepState {
  readonly batch: WriterBatch;
  readonly gated: readonly GatedWrite[];
  readonly flags: readonly StagedFlag[];
  readonly usage: WriterUsage | null;
}

export async function writeGatedBatch(
  parts: WriterParts,
  gated: GatedBatch,
): Promise<WriterBatchStep> {
  try {
    return await writeCappedBatch(parts, gated);
  } finally {
    await parts.gate.release(gated.gated.map((entry) => entry.verdict));
  }
}

async function writeCappedBatch(parts: WriterParts, gated: GatedBatch): Promise<WriterBatchStep> {
  const bounds = gated.batch.bounds;
  const capped = planProposalCap(parts.config, gated.batch, gated.gated);

  if (capped.kind === 'split') {
    const mode = pickBatchMode(gated.row, bounds);

    await writeBatchPlan(parts, { ...gated, bounds: capped.bounds, mode });

    return { next: 'continue', timers: [] };
  }

  const published = await tryWriteBatch(parts, { ...gated, bounds, capped });

  if (published.status === 'superseded') {
    return { next: 'continue', timers: [] };
  }

  return { next: 'wait', timers: [{ dueAt: gated.now + parts.config.paceMs }] };
}
