import { handoverClosedCodec } from '@heynixie/connectors';
import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// What the assistant reads when its ask ends with no take-over: an ask it withdrew, or one that
// lapsed.
export function renderHandoverClosed(record: LogRecord, times: MessageTimeOptions): string {
  const closed = handoverClosedCodec.decode(record.payload);

  const text =
    closed.by === 'expired'
      ? `Your handover ask lapsed after ${formatMinutes(closed.waitedSeconds)} with no take-over.`
      : 'You withdrew your handover ask.';

  return renderSystemMessage({
    type: 'computer',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${closed.shortID}] ${text}`,
  });
}

function formatMinutes(seconds: number): string {
  return `${String(Math.max(1, Math.round(seconds / 60)))} min`;
}
