import { StaleWriterError } from '@heynixie/log';
import type { StepInput, StepResult } from '@heynixie/tasks';
import { LeaseLostError } from '@heynixie/tasks';
import { buildWriterFailure } from './build-writer-failure';
import { readWriterRow } from './read-writer-row';
import { runWriterBatch } from './run-writer-batch';
import type { WriterParts } from './writer-parts';

// Runs one step of the memory writer. A failed batch records its error and backs off, and the step
// never throws it, so the writer never fails its task; a lost lease or a stale writer still ends
// the step with nothing written.
export async function runWriterStep(parts: WriterParts, input: StepInput): Promise<StepResult> {
  const acknowledged = input.inbox.map((record) => record.sequence);
  const now = parts.context.clock.now();
  const row = await readWriterRow(parts.context.log);

  if (row.retry_at !== null && now < row.retry_at) {
    return { next: 'wait', records: [], acknowledged, timers: [{ dueAt: row.retry_at }] };
  }
  try {
    return { ...(await runWriterBatch(parts, { input, row, now })), records: [], acknowledged };
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof StaleWriterError) {
      throw error;
    }

    // the backoff counts from the failure, so a slow batch still waits the whole delay
    return {
      ...buildWriterFailure(parts, { row, now: parts.context.clock.now(), error }),
      acknowledged,
    };
  }
}
