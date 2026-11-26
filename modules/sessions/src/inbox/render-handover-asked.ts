import { handoverAskedFieldsSchema } from '@heynixie/connectors';
import type { LogRecord } from '@heynixie/log';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { renderUntrustedText } from './render-untrusted-text';

// What the assistant reads of its own ask, with the ID that names it and the reason it gave inside
// the markers that a page read shows. The owner's name stands in the text, or "the user" when none
// is set.
export function renderHandoverAsked(
  record: LogRecord,
  times: MessageTimeOptions,
  ownerName: string | null,
  mint: () => string = mintBlockID,
): string {
  const first = `[#${String(record.sequence)}] You asked ${ownerName ?? 'the user'} to take over the computer.`;
  const reason = findReason(record);

  return renderSystemMessage({
    type: 'computer',
    at: formatMessageTime(record.recordedAt, null, times),
    body: [
      first,
      ...(reason === null ? [] : ['Reason:', ...renderUntrustedText(reason, mint)]),
    ].join('\n'),
  });
}

function findReason(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const parsed = handoverAskedFieldsSchema.safeParse(record.erasable.fields);

  return parsed.success ? parsed.data.reason : null;
}
