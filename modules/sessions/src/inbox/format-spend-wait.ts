import type { LogRecord } from '@heynixie/log';
import { spendWaitNoticeCodec } from '@heynixie/log';

// The model reads that it waited and for how long, and never a dollar figure or a route: a paused
// call tells it only to wait.
export function formatSpendWait(record: Pick<LogRecord, 'payload'>): string {
  const notice = spendWaitNoticeCodec.decode(record.payload);
  const minutes = Math.max(1, Math.round((notice.untilMs - notice.sinceMs) / 60_000));

  return (
    `This task waited about ${String(minutes)} min for a spending limit and has resumed. ` +
    'Nothing was lost.'
  );
}
