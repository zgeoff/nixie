import type { LogRecord } from '@heynixie/log';
import { findLateBySeconds, missingReminderBrief } from '@heynixie/tasks';
import type { TriggerFired } from '@heynixie/tasks';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// What a reminder needs beyond its record: the name, the note and the zone, which the inbox read
// pre-reads.
export interface ReminderRead {
  readonly fire: TriggerFired;

  // null: the version that holds the name and the note is no longer stored
  readonly name: string | null;
  readonly note: string | null;

  // the IANA zone the set time shows in
  readonly zone: string;
}

// The note and the name are text the model wrote, so each sits in a block of its own with a fresh
// random ID that no closing tag inside it can match.
export function renderReminderNotice(
  record: LogRecord,
  times: MessageTimeOptions,
  reminder: ReminderRead,
  mint: () => string = mintBlockID,
): string {
  const noteID = mint();
  const note = reminder.note ?? missingReminderBrief;
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
      `[#${record.sequence}] Reminder: <model-text id="${noteID}">${note}</model-text id="${noteID}">`,
      ...renderNameLine(reminder.name, mint),
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

function renderNameLine(name: string | null, mint: () => string): readonly string[] {
  if (name === null) {
    return [];
  }

  const nameID = mint();

  return [`Name: <model-text id="${nameID}">${name}</model-text id="${nameID}">`];
}
