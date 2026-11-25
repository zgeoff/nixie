import type { LiveTopic } from '@heynixie/log';
import type { SkillsRecordKind } from './skills-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const skillsRecordTopics = {
  'skills.pinned': [],
  'skills.reloaded': [],
  'skills.write_proposed': ['approvals'],
  'skills.write_approved': ['approvals'],
  'skills.write_applied': ['approvals'],
  'skills.write_rejected': ['approvals', 'tasks'],
  'skills.write_lapsed': ['approvals'],
  'skills.written_resolved': [],
} as const satisfies Record<SkillsRecordKind, readonly LiveTopic[]>;
