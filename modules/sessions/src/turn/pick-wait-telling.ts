import type { LogRecord } from '@heynixie/log';

// The wait notices past the batch that no turn has told, which the turn's opening tells. The read
// cursor moves only through an unbroken run of read records, so a notice past the batch stays
// unread, and the batch that reaches it later takes it silently.
export function pickWaitTelling<T extends Pick<LogRecord, 'kind' | 'sequence'>>(
  inbox: readonly T[],
  sent: ReadonlySet<number>,
  told: ReadonlySet<number>,
): readonly T[] {
  return inbox.filter(
    (record) =>
      record.kind === 'spend.wait_notice' &&
      !sent.has(record.sequence) &&
      !told.has(record.sequence),
  );
}
