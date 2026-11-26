import type { LiveTopic } from '@heynixie/log';
import type { ProposalRecordKind } from './proposal-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const proposalRecordTopics = {
  'proposals.proposed': ['approvals', 'tasks'],
  'proposals.settled': ['approvals', 'tasks'],
  'proposals.deferred': ['approvals', 'tasks'],
  'proposals.returned': ['approvals', 'tasks'],
  'proposals.proposer_left': ['approvals'],
  'proposals.withdrawn': ['approvals'],
} as const satisfies Record<ProposalRecordKind, readonly LiveTopic[]>;
