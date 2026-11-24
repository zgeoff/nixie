import type { LiveTopic } from '@heynixie/log';
import type { SessionsRecordKind } from './sessions-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const sessionsRecordTopics = {
  'memory.recalled': [],
} as const satisfies Record<SessionsRecordKind, readonly LiveTopic[]>;
