import type { LiveTopic } from '@heynixie/log';
import type { ServerRecordKind } from './server-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const serverRecordTopics = {
  'server.started': [],
} as const satisfies Record<ServerRecordKind, readonly LiveTopic[]>;
