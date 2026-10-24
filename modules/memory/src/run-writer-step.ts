import { StaleWriterError } from '@heynixie/log';
import type { StepInput, StepResult } from '@heynixie/tasks';
import { LeaseLostError } from '@heynixie/tasks';
import { buildWriterFailure } from './build-writer-failure';
import { readWriterRow } from './read-writer-row';
import { runWriterBatch } from './run-writer-batch';
import type { WriterParts } from './writer-parts';

export async function runWriterStep(parts: WriterParts, input: StepInput): Promise<StepResult> {
  const wakes = input.inbox
    .filter((record) => record.kind !== 'task_message')
    .map((record) => record.sequence);

  const now = parts.context.clock.now();

  const row = await readWriterRow(parts.context.log);

  if (row.retry_at !== null && now < row.retry_at) {
    return { next: 'wait', records: [], acknowledged: wakes, timers: [{ dueAt: row.retry_at }] };
  }

  try {
    const run = await runWriterBatch(parts, { input, row, now });

    return {
      next: run.next,
      timers: run.timers,
      records: [],
      acknowledged: run.hasRunSession ? input.inbox.map((record) => record.sequence) : wakes,
    };
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof StaleWriterError) {
      throw error;
    }

    return {
      ...buildWriterFailure(parts, { row, now: parts.context.clock.now(), error }),
      acknowledged: wakes,
    };
  }
}
