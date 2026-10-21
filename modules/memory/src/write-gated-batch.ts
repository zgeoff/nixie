import type { StepResult } from '@heynixie/tasks';
import { pickBatchMode } from './pick-batch-mode';
import { planProposalCap } from './plan-proposal-cap';
import type { WriterBatch } from './read-writer-batch';
import { tryWriteBatch } from './try-write-batch';
import { writeBatchPlan } from './write-batch-plan';
import type { GatedWrite } from './write-memory-batch';
import type { WriterParts, WriterStepState } from './writer-parts';
import type { StagedFlag, WriterUsage } from './writer-types';

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
