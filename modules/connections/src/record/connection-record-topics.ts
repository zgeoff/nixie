import type { LiveTopic } from '@heynixie/log';
import type { ConnectionRecordKind } from './connection-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const connectionRecordTopics = {
  'connection.revocation_recorded': [],
} as const satisfies Record<ConnectionRecordKind, readonly LiveTopic[]>;
