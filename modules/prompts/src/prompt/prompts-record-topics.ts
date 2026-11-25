import type { LiveTopic } from '@heynixie/log';
import type { PromptsRecordKind } from './prompts-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const promptsRecordTopics = {
  'prompts.override_proposed': ['approvals'],
  'prompts.override_approved': ['approvals'],
  'prompts.override_rejected': ['approvals'],
  'prompts.override_lapsed': ['approvals'],
  'prompts.override_exported': [],
} as const satisfies Record<PromptsRecordKind, readonly LiveTopic[]>;
