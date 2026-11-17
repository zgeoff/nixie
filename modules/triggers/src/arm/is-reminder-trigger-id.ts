import { reminderTriggerPrefix } from './reminder-trigger-prefix';

export function isReminderTriggerID(triggerID: string): boolean {
  return triggerID.startsWith(reminderTriggerPrefix);
}
