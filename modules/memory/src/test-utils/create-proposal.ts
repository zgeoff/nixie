import invariant from 'tiny-invariant';
import type { MemoryProposal, WriteCaller } from '../gate-types';
import type { StartedMemoryStore } from '../start-memory-store';
import type { VersionRef } from '../types';
import { buildMockWriteCaller } from './build-mock-write-caller';

export interface ProposalRequest {
  readonly text: string;

  // the item and version an edit names; a new item when absent
  readonly target?: VersionRef;

  // the conversation write that makes it, with a random model by default
  readonly caller?: WriteCaller;
}

// Writes a conversation memory.remember with no quote, which the gate always holds for review, and
// returns the pending proposal it made.
export async function createProposal(
  store: Pick<StartedMemoryStore, 'writes' | 'proposals'>,
  request: ProposalRequest,
): Promise<MemoryProposal> {
  const outcome = await store.writes.remember({
    text: request.text,
    ...(request.target === undefined ? {} : { target: request.target }),
    caller: request.caller ?? buildMockWriteCaller(),
  });
  const pending = await store.proposals.listPending();
  const proposal = pending.find(
    (entry) => outcome.status === 'proposed' && entry.proposalID === outcome.proposalID,
  );

  invariant(proposal, 'the write made no pending proposal');
  return proposal;
}
