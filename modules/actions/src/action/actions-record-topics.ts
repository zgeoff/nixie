import type { LiveTopic } from '@heynixie/log';
import type { ActionsRecordKind } from './actions-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const actionsRecordTopics = {
  'action.queued': ['tasks'],
  'action.attempt_started': ['tasks'],
  'action.retry_scheduled': ['tasks'],
  'action.reconcile_scheduled': ['tasks'],
  'action.reconcile_checked': ['tasks'],
  'action.held': ['tasks', 'approvals'],
  'action.released': ['tasks', 'approvals'],
  'action.unknown_answered': ['tasks', 'approvals'],
} as const satisfies Record<ActionsRecordKind, readonly LiveTopic[]>;
