import type { LiveTopic } from '@heynixie/log';
import type { ConnectionRecordKind } from './connection-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const connectionRecordTopics = {
  'connection.revocation_recorded': ['connections'],
  'connection.client_registered': ['connections'],
  'connection.client_removed': ['connections'],
  'connection.picker_set': ['connections'],
  'connection.connected': ['connections'],
  'connection.consent_discarded': [],
} as const satisfies Record<ConnectionRecordKind, readonly LiveTopic[]>;
