import type { LiveTopic } from '@heynixie/log';
import type { RulesRecordKind } from './rules-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const rulesRecordTopics = {
  'rules.change_proposed': ['approvals'],
  'rules.change_approved': ['approvals'],
  'rules.change_rejected': ['approvals'],
  'rules.change_lapsed': ['approvals'],
  'rules.change_withdrawn': ['approvals'],
  'rules.runtime_changed': ['definitions'],
  'rules.conflict_resolved': ['definitions'],
  'rules.rule_proposed': ['approvals'],
  'rules.rule_answered': ['approvals'],
  'rules.rule_lapsed': ['approvals'],
  'rules.mandate_proposed': ['approvals'],
  'rules.mandate_started': ['approvals'],
  'rules.mandate_declined': ['approvals'],
  'rules.mandate_lapsed': ['approvals'],
  'rules.mandate_ended': ['approvals'],
} as const satisfies Record<RulesRecordKind, readonly LiveTopic[]>;
