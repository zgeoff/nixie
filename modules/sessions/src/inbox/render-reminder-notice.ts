import type { LogRecord } from '@heynixie/log';
import { missingReminderBrief } from '@heynixie/tasks';
import type { TriggerFired } from '@heynixie/tasks';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { formatReminderLateness } from './format-reminder-lateness';

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

const reminderHandlingLine =
  'You can handle this now, hand it to a task, set a one-off for later, or snooze or skip it.';

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
  const lateness = formatReminderLateness(reminder.fire, times.now.getTime());

  const setLine =
    lateness === null ? `It was set for ${setFor}.` : `It was set for ${setFor}, and ${lateness}.`;

  return renderSystemMessage({
    type: 'reminder',
    at: formatMessageTime(record.recordedAt, reminder.zone, times),
    body: [
      `[#${record.sequence}] Reminder: <model-text id="${noteID}">${note}</model-text id="${noteID}">`,
      ...renderNameLine(reminder.name, mint),
      setLine,
      reminderHandlingLine,
    ].join('\n'),
  });
}

function renderNameLine(name: string | null, mint: () => string): readonly string[] {
  if (name === null) {
    return [];
  }

  const nameID = mint();

  return [`Name: <model-text id="${nameID}">${name}</model-text id="${nameID}">`];
}
