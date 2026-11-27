import type { LogRecord } from '@heynixie/log';

export interface AnsweredInbox {
  // the records that no kept reply answers, which the rerun's turn takes
  readonly remaining: readonly LogRecord[];

  // the sequences of the records that a kept reply answers
  readonly answered: readonly number[];
}

// A turn that a cleanup aborted kept the replies it wrote, and each one names the records the turn
// had read. The rerun leaves those records alone, and a record that the turn had not read stays.
export function pickAnsweredInbox(
  inbox: readonly LogRecord[],
  answeredSequences: ReadonlySet<number>,
): AnsweredInbox {
  return {
    remaining: inbox.filter((record) => !answeredSequences.has(record.sequence)),
    answered: inbox
      .filter((record) => answeredSequences.has(record.sequence))
      .map((record) => record.sequence),
  };
}
