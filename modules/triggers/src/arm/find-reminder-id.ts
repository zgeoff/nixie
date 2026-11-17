import { reminderTriggerPrefix } from './reminder-trigger-prefix';

// The reminder ID that a trigger ID names, or null for a trigger that is no reminder's.
export function findReminderID(triggerID: string): string | null {
  return triggerID.startsWith(reminderTriggerPrefix)
    ? triggerID.slice(reminderTriggerPrefix.length)
    : null;
}
