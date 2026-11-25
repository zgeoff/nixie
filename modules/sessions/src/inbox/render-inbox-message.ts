import type { LogRecord } from '@heynixie/log';
import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import { formatMessageWhen } from '../message/format-message-when';
import type { TaskMessageView } from '../task/render-task-message';
import { renderTaskMessage } from '../task/render-task-message';
import type { MessageTimeOptions } from '../types';
import { findSessionLabel } from '../utils/find-session-label';
import { renderOwnerText } from '../utils/render-owner-text';
import { renderActionFailure } from './render-action-failure';
import type { ActionResultBlock } from './render-action-result';
import { renderApprovalAnswer } from './render-approval-answer';
import { renderCallNotice } from './render-call-notice';
import { renderCallThreadLine } from './render-call-thread-line';
import type { HeardCut } from './render-call-thread-line';
import { renderHandoverAsked } from './render-handover-asked';
import { renderHandoverClosed } from './render-handover-closed';
import { renderLimitNotice } from './render-limit-notice';
import { renderMailWoke } from './render-mail-woke';
import { renderPageEventMessage } from './render-page-event-message';
import { renderProposalDecline } from './render-proposal-decline';
import { renderProposalDefer } from './render-proposal-defer';
import { renderRecoveryNotice } from './render-recovery-notice';
import type { ReminderRead } from './render-reminder-notice';
import { renderReminderNotice } from './render-reminder-notice';
import { renderTakeoverEnded } from './render-takeover-ended';
import { renderTakeoverStarted } from './render-takeover-started';
import { renderToolChangeNote } from './render-tool-change-note';

// What the inbox read fetched beside the record, for the kinds that show it.
interface RenderedExtras {
  readonly reminder?: ReminderRead | null;
  readonly result?: ActionResultBlock | null;
  readonly approvedAt?: Date | null;
  readonly cut?: HeardCut | null;
  readonly smallTalk?: readonly string[];
}

export function renderInboxMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  view: TaskMessageView,
  extras: RenderedExtras = {},
): string {
  const reminder = extras.reminder ?? null;

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
    return renderRecordMessage(record, 'outcome', times, {
      result: extras.result ?? null,
      approvedAt: extras.approvedAt ?? null,
    });
  }

  if (record.kind === 'task.limit_notice') {
    return renderLimitNotice(record, times);
  }

  if (record.kind === 'recovery.notice') {
    return renderRecoveryNotice(record, times);
  }

  if (record.kind === 'tool_changed') {
    return renderToolChangeNote(record, times);
  }

  if (record.kind === 'computer.takeover_started') {
    return renderTakeoverStarted(record, times, view.messaging.ownerName);
  }

  if (record.kind === 'computer.takeover_ended') {
    return renderTakeoverEnded(record, times, view.messaging.ownerName);
  }

  if (record.kind === 'computer.handover_closed') {
    return renderHandoverClosed(record, times, view.messaging.ownerName);
  }

  if (record.kind === 'computer.handover_asked') {
    return renderHandoverAsked(record, times, view.messaging.ownerName);
  }

  if (
    record.kind === 'call.started' ||
    record.kind === 'call.answered' ||
    record.kind === 'call.ended'
  ) {
    return renderCallNotice(record, times, view.messaging.ownerName ?? 'the user');
  }

  if (
    record.kind === 'call.handed_off' ||
    record.kind === 'call.heard_cut' ||
    record.kind === 'call.closing'
  ) {
    return renderCallThreadLine(record, times, extras.cut ?? null, extras.smallTalk ?? []);
  }

  if (record.kind === 'device.page_event') {
    return renderPageEventMessage(record, times);
  }

  if (record.kind === 'policy.action_answered') {
    return renderApprovalAnswer(record, times);
  }

  if (record.kind === 'trigger.mail_woke') {
    return renderMailWoke(record, times);
  }

  if (record.kind === 'trigger.fired' && reminder !== null) {
    return renderReminderNotice(record, times, reminder);
  }

  // memory and skills register these kinds, and sessions depends on neither
  const kind: string = record.kind;

  if (kind === 'memory.proposal_rejected' || kind === 'skills.write_rejected') {
    return renderProposalDecline(record, times);
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

// What an outcome's message shows beside its record: the call's result, and when the owner approved
// the action.
interface OutcomeExtras {
  readonly result: ActionResultBlock | null;
  readonly approvedAt: Date | null;
}

function renderRecordMessage(
  record: LogRecord,
  type: RecordMessageType,
  times: MessageTimeOptions,
  extras: OutcomeExtras | null = null,
): string {
  const line = `[#${record.sequence}] ${recordSummaries[type]}: ${JSON.stringify(record.payload)}`;
  const failure = type === 'outcome' ? renderActionFailure(record) : null;
  const approvedAt = extras?.approvedAt ?? null;
  const result = extras?.result ?? null;

  const approved =
    approvedAt === null ? null : `Approved ${formatMessageTime(approvedAt, null, times)}.`;

  return renderSystemMessage({
    type,
    at: formatMessageTime(record.recordedAt, null, times),
    body: [
      line,
      ...(approved === null ? [] : [approved]),
      ...(failure === null ? [] : [failure]),
      ...(result === null ? [] : [result.text]),
    ].join('\n'),
  });
}
