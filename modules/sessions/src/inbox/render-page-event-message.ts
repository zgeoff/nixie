import { renderPageEvent, toRenderedPageEvent } from '@heynixie/devices';
import type { LogRecord } from '@heynixie/log';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// What the assistant reads when a page asked to wake it: the line that says where the event came
// from, then the page's own text inside the markers that a page read shows.
export function renderPageEventMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  mint: () => string = mintBlockID,
): string {
  const event = toRenderedPageEvent(record.payload, record.erasable);

  return renderSystemMessage({
    type: 'page-event',
    at: formatMessageTime(record.recordedAt, null, times),
    body: renderPageEvent(event, mint).join('\n'),
  });
}
