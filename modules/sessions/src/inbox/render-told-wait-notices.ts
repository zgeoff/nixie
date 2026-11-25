import type { LogRecord } from '@heynixie/log';
import type { MessageTimeOptions } from '../types';
import { renderSpendWaitNotice } from './render-spend-wait-notice';

// The opening's lines for wait notices past the batch, each as the batch would show it, so the
// model reads one notice under one ID whichever path told it.
export function renderToldWaitNotices(
  records: readonly LogRecord[],
  times: MessageTimeOptions,
): string | null {
  if (records.length === 0) {
    return null;
  }

  return records.map((record) => renderSpendWaitNotice(record, times)).join('\n\n');
}
