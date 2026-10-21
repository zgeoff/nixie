import { planBackoffDelay } from '@heynixie/retry';
import type { StepResult } from '@heynixie/tasks';
import type { WriterParts } from './writer-parts';
import type { WriterRow } from './writer-types';

export interface WriterFailure {
  readonly row: WriterRow;
  readonly now: number;
  readonly error: unknown;
}

const maxErrorCharacters = 2000;

export function buildWriterFailure(
  parts: Pick<WriterParts, 'config' | 'context'>,
  failure: WriterFailure,
): Omit<StepResult, 'acknowledged'> {
  const failures = failure.row.failures + 1;

  const backoff = planBackoffDelay(failures, {
    firstMs: parts.config.firstBackoffMs,
    maxMs: parts.config.maxBackoffMs,
  });

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

function pickErrorCode(error: unknown): string {
  return error instanceof Error && error.name !== 'Error' ? error.name : 'batch_failed';
}
