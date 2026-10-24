import { readBatchBounds } from './read-batch-bounds';
import { readWriterBatch } from './read-writer-batch';
import { runWriterExtraction } from './run-writer-extraction';
import { tryRunWriterGate } from './try-run-writer-gate';
import { writeGatedBatch } from './write-gated-batch';
import type { WriterBatchStep } from './write-gated-batch';
import type { WriterParts, WriterStepState } from './writer-parts';

export interface WriterBatchRun extends WriterBatchStep {
  readonly hasRunSession: boolean;
}

export async function runWriterBatch(
  parts: WriterParts,
  state: WriterStepState,
): Promise<WriterBatchRun> {
  const bounds = await readBatchBounds(parts, state);

  if ('wakeAt' in bounds) {
    return {
      next: 'wait',
      timers: bounds.wakeAt === null ? [] : [{ dueAt: bounds.wakeAt }],
      hasRunSession: false,
    };
  }

  const batch = await readWriterBatch(parts.context.log, bounds);
  const extracted = await runWriterExtraction(parts, batch, state.input);

  const hasRunSession = extracted.usage !== null;

  const gated = await tryRunWriterGate(parts.gate, extracted.writes, {
    findSource: (sequence) => batch.sources.get(sequence),
    isShownText: (text) => extracted.shownTexts.has(text),
    batch: { bounds, model: parts.model.model },
  });

  if (gated === null) {
    return { next: 'continue', timers: [], hasRunSession };
  }

  const written = await writeGatedBatch(parts, {
    ...state,
    batch,
    gated,
    flags: extracted.flags,
    usage: extracted.usage,
  });

  return { next: written.next, timers: written.timers, hasRunSession };
}
