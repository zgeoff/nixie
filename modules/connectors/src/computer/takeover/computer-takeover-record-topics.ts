import type { LiveTopic } from '@heynixie/log';
import type { ComputerTakeoverRecordKind } from './computer-takeover-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const computerTakeoverRecordTopics = {
  'computer.takeover_started': ['computer', 'tasks'],
  'computer.takeover_ended': ['computer', 'tasks'],
  'computer.handover_asked': ['computer', 'tasks'],
  'computer.handover_closed': ['computer', 'tasks'],
} as const satisfies Record<ComputerTakeoverRecordKind, readonly LiveTopic[]>;
