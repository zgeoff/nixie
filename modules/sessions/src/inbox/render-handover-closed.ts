import { handoverClosedCodec } from '@heynixie/connectors';
import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// What the assistant reads when its ask lapsed with no take-over.
export function renderHandoverClosed(record: LogRecord, times: MessageTimeOptions): string {
  const closed = handoverClosedCodec.decode(record.payload);
  const text = `Your handover ask lapsed after ${formatMinutes(closed.waitedSeconds)} with no take-over.`;

  return renderSystemMessage({
    type: 'computer',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${closed.shortID}] ${text}`,
  });
}

function formatMinutes(seconds: number): string {
  return `${String(Math.max(1, Math.round(seconds / 60)))} min`;
}
