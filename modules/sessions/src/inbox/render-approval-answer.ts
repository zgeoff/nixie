import type { LogRecord } from '@heynixie/log';
import { actionAnsweredCodec } from '@heynixie/policy';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// The owner's answer to a proposal that the task's own call asked for. An approval names the action it queued.
export function renderApprovalAnswer(record: LogRecord, times: MessageTimeOptions): string {
  const answer = actionAnsweredCodec.decode(record.payload);
  const reason = pickReason(record);

  const text =
    answer.answer === 'approved'
      ? `Approved \`${answer.shortID}\`.${answer.actionID === undefined ? '' : ` Queued as \`${answer.actionID}\`.`}`
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
