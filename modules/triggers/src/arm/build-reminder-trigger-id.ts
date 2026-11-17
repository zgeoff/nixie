import { reminderTriggerPrefix } from './reminder-trigger-prefix';

// A colon never occurs in a definition ID, so a reminder's trigger and a definition's never collide.
export function buildReminderTriggerID(reminderID: string): string {
  return `${reminderTriggerPrefix}${reminderID}`;
}
