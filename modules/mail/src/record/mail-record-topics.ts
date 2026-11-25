import type { LiveTopic } from '@heynixie/log';
import type { MailRecordKind } from './mail-record-kind';

// The topics each record kind changes, which the server registers with the log. No page shows the
// assistant's mail yet.
export const mailRecordTopics = {
  'mail.received': [],
  'mail.sent': [],
  'mail.marked_read': [],
} as const satisfies Record<MailRecordKind, readonly LiveTopic[]>;
