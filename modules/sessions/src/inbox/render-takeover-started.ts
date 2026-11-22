import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { capitalizeFirst } from './capitalize-first';

// What the assistant reads when a person takes the desktop, in the owner's name, or "the user" when
// none is set.
export function renderTakeoverStarted(
  record: LogRecord,
  times: MessageTimeOptions,
  ownerName: string | null,
): string {
  return renderSystemMessage({
    type: 'computer',
    at: formatMessageTime(record.recordedAt, null, times),
    body:
      `[#${record.sequence}] ${capitalizeFirst(ownerName ?? 'the user')} took over the computer. You can ` +
      'read the screen and your tabs; your clicks, typing and commands wait until it comes back.',
  });
}
