import type { LiveTopic } from '@heynixie/log';
import type { DefinitionTaskRecordKind } from './definition-task-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const definitionTaskRecordTopics = {
  'definition.changed': ['definitions'],
  'definition.settled': ['definitions'],
  'definition.repo_moved': ['definitions'],
  'definition.conflict_resolved': ['definitions'],
  'definition.export_moved': ['definitions'],
} as const satisfies Record<DefinitionTaskRecordKind, readonly LiveTopic[]>;
