import type { LogRecord } from '@heynixie/log';

// A wait notice that an earlier turn's opening told, so a batch that reaches it takes it with no
// text.
export function isToldWaitNotice(
  record: Pick<LogRecord, 'kind' | 'sequence'>,
  toldThrough: number,
): boolean {
  return record.kind === 'spend.wait_notice' && record.sequence <= toldThrough;
}
