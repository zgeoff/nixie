import type { LiveTopic } from '@heynixie/log';
import type { CodingRecordKind } from './coding-record-kind';

// The topics each record kind changes, which the server registers with the log. A bound session
// moves with its task, so each kind of a task's thread changes what the task list shows.
export const codingRecordTopics = {
  'coding.session_bound': ['tasks'],
  'coding.session_named': [],
  'coding.steered': ['tasks'],
  'coding.delivered': ['tasks'],
  'coding.answer_held': ['tasks'],
  'coding.wake_set': ['tasks'],
  'coding.session_unbound': ['tasks'],
  'coding.session_lost': ['tasks'],
} as const satisfies Record<CodingRecordKind, readonly LiveTopic[]>;
