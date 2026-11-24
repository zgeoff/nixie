import type { LiveTopic } from '@heynixie/log';
import type { PolicyRecordKind } from './policy-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const policyRecordTopics = {
  'policy.action_proposed': ['approvals'],
  'policy.action_answered': ['approvals', 'tasks'],
  'policy.action_lapsed': ['approvals'],
  'policy.contact_marked_known': [],
  'policy.contact_unmarked': [],
} as const satisfies Record<PolicyRecordKind, readonly LiveTopic[]>;
