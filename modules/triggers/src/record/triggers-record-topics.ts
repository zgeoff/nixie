import type { LiveTopic } from '@heynixie/log';
import type { TriggersRecordKind } from './triggers-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const triggersRecordTopics = {
  'trigger.armed': ['triggers'],
  'trigger.delivered': ['triggers'],
  'trigger.deferred': ['triggers'],
} as const satisfies Record<TriggersRecordKind, readonly LiveTopic[]>;
