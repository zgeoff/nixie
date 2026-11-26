import type { LiveTopic } from '@heynixie/log';
import type { SpendRecordKind } from './spend-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const spendRecordTopics = {
  'spend.limit_raised': ['spend'],
  'spend.count_set': ['spend'],
} as const satisfies Record<SpendRecordKind, readonly LiveTopic[]>;
