import type { StepResult } from '@heynixie/tasks';
import { planWriterBackoff } from './plan-writer-backoff';
import type { WriterParts } from './writer-parts';
import type { WriterRow } from './writer-types';

export interface WriterFailure {
  readonly row: WriterRow;
  readonly now: number;
  readonly error: unknown;
}

// The step result of a failed batch: its error, and a timer at the end of the backoff, when the
// writer tries the same batch again. The message is free text, so it goes in the erasable fields.
export function buildWriterFailure(
  parts: Pick<WriterParts, 'config' | 'context'>,
  failure: WriterFailure,
): Omit<StepResult, 'acknowledged'> {
  const failures = failure.row.failures + 1;
  const backoff = planWriterBackoff(
    failures,
    parts.config.firstBackoffMs,
    parts.config.maxBackoffMs,
  );
  const retryAt = failure.now + backoff;
  const message = failure.error instanceof Error ? failure.error.message : String(failure.error);

  return {
    next: 'wait',
    timers: [{ dueAt: retryAt }],
    records: [
      {
        kind: 'memory.writer_failed',
        definitions: parts.context.definitions(),
        payload: { code: pickErrorCode(failure.error), failures, retryAt, at: failure.now },
        erasable: { message: message.slice(0, maxErrorCharacters) },
      },
    ],
  };
}

const maxErrorCharacters = 2000;

function pickErrorCode(error: unknown): string {
  return error instanceof Error && error.name !== 'Error' ? error.name : 'batch_failed';
}
