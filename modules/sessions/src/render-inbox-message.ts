import type { LogRecord } from '@heynixie/log';
import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import { findSessionLabel } from './find-session-label';
import { formatMessageTime } from './format-message-time';
import { formatMessageWhen } from './format-message-when';
import { renderApprovalAnswer } from './render-approval-answer';
import { renderLimitNotice } from './render-limit-notice';
import { renderOwnerText } from './render-owner-text';
import { renderProposalDefer } from './render-proposal-defer';
import type { TaskMessageView } from './render-task-message';
import { renderTaskMessage } from './render-task-message';
import type { MessageTimeOptions } from './types';

export function renderInboxMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  view: TaskMessageView,
): string {
  if (record.kind === 'owner_message') {
    return renderOwnerMessage(record, times, view.messaging.ownerName);
  }

  if (record.kind === 'task_message') {
    return renderTaskMessage(record, times, view);
  }

  if (record.kind === 'timer.fired') {
    return renderRecordMessage(record, 'timer', times);
  }

  if (record.kind === 'action.outcome') {
    return renderRecordMessage(record, 'outcome', times);
  }

  if (record.kind === 'task.limit_notice') {
    return renderLimitNotice(record, times);
  }

  if (record.kind === 'policy.action_answered') {
    return renderApprovalAnswer(record, times);
  }

  if (record.kind === 'proposals.deferred' || record.kind === 'proposals.returned') {
    return renderProposalDefer(record, times);
  }

  return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
}

// The id is the event ID that a task passes in on-behalf-of. The session label of a message from a
// device you named shows beside its time.
function renderOwnerMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  ownerName: string | null,
): string {
  const label = findSessionLabel(record);

  const attributes = [
    ['id', String(record.sequence)],
    ['from', ownerName ?? 'the owner'],
    ['sent', formatMessageWhen(record, times)],
    ...(label === null ? [] : [['session', label]]),
  ];

  return [
    `<owner-message ${attributes.map(([name, value]) => `${name}="${escapeAttribute(value ?? '')}"`).join(' ')}>`,
    renderOwnerText(record),
    '</owner-message>',
  ].join('\n');
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

type RecordMessageType = Extract<SystemMessageType, 'timer' | 'outcome'>;

const recordSummaries = { timer: 'A timer fired', outcome: 'An action settled' } as const;

function renderRecordMessage(
  record: LogRecord,
  type: RecordMessageType,
  times: MessageTimeOptions,
): string {
  return renderSystemMessage({
    type,
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${record.sequence}] ${recordSummaries[type]}: ${JSON.stringify(record.payload)}`,
  });
}
