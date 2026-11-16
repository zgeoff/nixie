import type { LogRecord } from '@heynixie/log';
import { findLateBySeconds } from '@heynixie/tasks';
import type { TriggerFired } from '@heynixie/tasks';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// What a reminder needs beyond its record: the brief and the zone, which the inbox read pre-reads.
export interface ReminderRead {
  readonly fire: TriggerFired;

  // null: the version that holds the brief is no longer stored
  readonly brief: string | null;

  // the IANA zone the set time shows in
  readonly zone: string;
}

const missingBrief = '[a reminder whose text is no longer stored]';

// The brief is text the model wrote, so it sits in a block of its own with a fresh random ID that
// no closing tag inside the brief can match.
export function renderReminderNotice(
  record: LogRecord,
  times: MessageTimeOptions,
  reminder: ReminderRead,
  mint: () => string = mintBlockID,
): string {
  const blockID = mint();
  const brief = reminder.brief ?? missingBrief;
  const setFor = formatMessageTime(new Date(reminder.fire.scheduledFor), reminder.zone, times);
  const lateBySeconds = findLateBySeconds(reminder.fire);

  const setLine =
    lateBySeconds === null
      ? `It was set for ${setFor}.`
      : `It was set for ${setFor}, and arrives ${formatDuration(lateBySeconds)} late.`;

  return renderSystemMessage({
    type: 'reminder',
    at: formatMessageTime(record.recordedAt, reminder.zone, times),
    body: [
      `[#${record.sequence}] Reminder you set: <model-text id="${blockID}">${brief}</model-text id="${blockID}">`,
      setLine,
    ].join('\n'),
  });
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));

  if (totalMinutes < 60) {
    return formatUnit(totalMinutes, 'minute');
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0
    ? formatUnit(hours, 'hour')
    : `${formatUnit(hours, 'hour')} ${formatUnit(minutes, 'minute')}`;
}

function formatUnit(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}
