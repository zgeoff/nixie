import type { LiveTopic } from '@heynixie/log';
import type { CallRecordKind } from './call-record-kind';

// The topics each record kind changes, which the server registers with the log. A call is a task,
// so the 4 kinds that open, answer, reconnect or end it change what the task list shows.
export const callRecordTopics = {
  'call.rang': [],
  'call.started': ['tasks'],
  'call.answered': ['tasks'],
  'call.reconnected': [],
  'call.ended': ['tasks'],
  'call.spoke': [],
  'call.handed_off': [],
  'call.heard_cut': [],
  'call.turn_timed': [],
} as const satisfies Record<CallRecordKind, readonly LiveTopic[]>;
