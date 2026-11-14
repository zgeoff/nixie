import invariant from 'tiny-invariant';
import type { MemoryProposal } from '../gate/gate-context';
import type { ProposalRequest } from './create-proposal';
import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedProposal } from './seed-proposal';

export async function seedConsumedProposal(
  deps: MemorySeederDeps,
  input: Partial<ProposalRequest> = {},
): Promise<MemoryProposal> {
  const proposal = await seedProposal(deps, input);

  const result = await deps.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  invariant(result.status === 'applied', 'the pending proposal applies');

  return proposal;
}
