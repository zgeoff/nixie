import type { ProposeDeps } from '../answer/types';
import { defaultProposalConfig } from '../propose/build-propose-deps';

// The settlement parts of the core's deps for a test that holds no tasks: a settlement lands on the
// thread of its proposer.
export function buildMockSettlementDeps(): Pick<
  ProposeDeps,
  'config' | 'conversationThread' | 'readSettlementTarget'
> {
  return {
    config: defaultProposalConfig,
    conversationThread: 'conversation',
    readSettlementTarget: (_tx, thread) => Promise.resolve({ thread, task: null }),
  };
}
