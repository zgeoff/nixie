import type { LogRecord } from '@heynixie/log';

type InboxRecord = Pick<LogRecord, 'kind' | 'sequence'>;

export interface WaitTelling<T extends InboxRecord> {
  // the wait notices past the batch that no turn has told, which the turn's opening tells
  readonly told: readonly T[];

  // the newest wait notice past the batch, which the next turn reads as told, or null for none
  readonly toldThrough: number | null;
}

// The read cursor moves only through an unbroken run of read records, so a wait notice past the
// batch stays unread. The opening tells it now, and the batch that reaches it later takes it
// silently.
export function pickWaitTelling<T extends InboxRecord>(
  inbox: readonly T[],
  sent: ReadonlySet<number>,
  toldThrough: number,
): WaitTelling<T> {
  const past = inbox.filter(
    (record) => record.kind === 'spend.wait_notice' && !sent.has(record.sequence),
  );

  return {
    told: past.filter((record) => record.sequence > toldThrough),
    toldThrough: past.length === 0 ? null : Math.max(...past.map((record) => record.sequence)),
  };
}
