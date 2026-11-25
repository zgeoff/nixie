import type { LiveTopic } from '@heynixie/log';
import type { RemindersRecordKind } from './reminders-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const remindersRecordTopics = {
  'reminder.set': [],
  'reminder.updated': [],
  'reminder.cancelled': [],
} as const satisfies Record<RemindersRecordKind, readonly LiveTopic[]>;
