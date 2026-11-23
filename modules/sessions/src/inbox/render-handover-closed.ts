import { handoverClosedCodec } from '@heynixie/connectors';
import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// What the assistant reads when its ask closed: the ID of its own withdrawal, in the owner's name
// or "the user" when none is set, or that the ask lapsed with no take-over.
export function renderHandoverClosed(
  record: LogRecord,
  times: MessageTimeOptions,
  ownerName: string | null,
): string {
  const closed = handoverClosedCodec.decode(record.payload);

  const text = {
    assistant: `You withdrew your ask for ${ownerName ?? 'the user'} to take over the computer.`,
    expired: `Your handover ask lapsed after ${formatMinutes(closed.waitedSeconds)} with no take-over.`,
  }[closed.by];

  return renderSystemMessage({
    type: 'computer',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${closed.shortID}] ${text}`,
  });
}

function formatMinutes(seconds: number): string {
  return `${String(Math.max(1, Math.round(seconds / 60)))} min`;
}
