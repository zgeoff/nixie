import type { LiveTopic } from '@heynixie/log';
import type { TriggersRecordKind } from './triggers-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const triggersRecordTopics = {
  'trigger.armed': ['triggers', 'definitions'],
  'trigger.delivered': ['triggers'],
  'trigger.deferred': ['triggers', 'definitions'],
  'trigger.wake_rule_set': ['triggers'],
  'trigger.wake_rule_ended': ['triggers'],
  'trigger.mail_arrived': ['triggers'],
} as const satisfies Record<TriggersRecordKind, readonly LiveTopic[]>;
