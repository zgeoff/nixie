import type { LogRecord } from '@heynixie/log';
import { actionAnsweredCodec } from '@heynixie/policy';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

// The owner's answer to a proposal that the task's own call asked for. An approval runs nothing yet,
// so the message says so.
export function renderApprovalAnswer(record: LogRecord, times: MessageTimeOptions): string {
  const answer = actionAnsweredCodec.decode(record.payload);
  const reason = pickReason(record);

  const text =
    answer.answer === 'approved'
      ? `Approved \`${answer.shortID}\`. nixie runs approved actions in a later release, so this one did not run.`
      : `Declined \`${answer.shortID}\`.${reason === null ? '' : ` ${reason}`}`;

  return renderSystemMessage({
    type: 'approval',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${String(record.sequence)}] ${text}`,
  });
}

function pickReason(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const reason = record.erasable.fields['reason'];

  return typeof reason === 'string' && reason !== '' ? reason : null;
}
