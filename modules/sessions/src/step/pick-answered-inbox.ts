import type { LogRecord } from '@heynixie/log';

export interface AnsweredInbox {
  // the records that no kept reply answers, which the rerun's turn takes
  readonly remaining: readonly LogRecord[];

  // the sequences of the records that a kept reply answers
  readonly answered: readonly number[];
}

// A turn that a cleanup aborted kept the reply it wrote, so each record before that reply was read
// and answered, and the rerun leaves it alone.
export function pickAnsweredInbox(
  inbox: readonly LogRecord[],
  answeredThrough: number | null,
): AnsweredInbox {
  if (answeredThrough === null) {
    return { remaining: inbox, answered: [] };
  }

  return {
    remaining: inbox.filter((record) => record.sequence > answeredThrough),
    answered: inbox
      .filter((record) => record.sequence < answeredThrough)
      .map((record) => record.sequence),
  };
}
