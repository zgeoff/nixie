import { findBatchBounds } from './find-batch-bounds';
import { readWriterBatch } from './read-writer-batch';
import { runWriterExtraction } from './run-writer-extraction';
import { runWriterGate } from './run-writer-gate';
import { writeGatedBatch } from './write-gated-batch';
import type { WriterBatchStep } from './write-gated-batch';
import type { WriterParts, WriterStepState } from './writer-parts';

// Takes the batch the cursor waits on, runs a fresh model session over it, gates each staged write
// and publishes the batch with its cursor in one transaction. A batch over the proposal cap splits
// and runs again, and one that a newer change superseded runs again at once.
export async function runWriterBatch(
  parts: WriterParts,
  state: WriterStepState,
): Promise<WriterBatchStep> {
  const bounds = await findBatchBounds(parts, state);

  if ('wakeAt' in bounds) {
    return { next: 'wait', timers: bounds.wakeAt === null ? [] : [{ dueAt: bounds.wakeAt }] };
  }
  const batch = await readWriterBatch(parts.context.log, bounds);
  const extracted = await runWriterExtraction(parts, batch, state.input.signal);
  const gated = await runWriterGate(parts.gate, extracted.writes, {
    findSource: (sequence) => batch.sources.get(sequence),
    isShownText: (text) => extracted.shownTexts.has(text),
  });

  return writeGatedBatch(parts, { ...state, batch, gated, usage: extracted.usage });
}
