import { handoverAskedCodec, handoverAskedFieldsSchema } from '@heynixie/connectors';
import type { LogRecord } from '@heynixie/log';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { renderUntrustedText } from './render-untrusted-text';

// What the assistant reads of its own ask, in the owner's name, or "the user" when none is set. The
// reason sits inside the markers of untrusted text, because it can carry a page's words.
export function renderHandoverAsked(
  record: LogRecord,
  times: MessageTimeOptions,
  ownerName: string | null,
  mint: () => string = mintBlockID,
): string {
  const shortID = handoverAskedCodec.decode(record.payload).shortID;
  const name = ownerName ?? 'the user';
  const reason = findReason(record);

  return renderSystemMessage({
    type: 'computer',
    at: formatMessageTime(record.recordedAt, null, times),
    body: [
      `[#${shortID}] You asked ${name} to take over the computer.`,
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
