import type { LiveTopic } from '@heynixie/log';
import type { DefinitionsRecordKind } from './definitions-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const definitionsSeededRecordTopics = {
  definitions_seeded: ['definitions'],
} as const satisfies Record<DefinitionsRecordKind, readonly LiveTopic[]>;
