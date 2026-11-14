import type { MemoryProposal } from '../gate-context';
import type { ProposalRequest } from './create-proposal';
import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedProposal } from './seed-proposal';

export async function seedRejectedProposal(
  deps: MemorySeederDeps,
  input: Partial<ProposalRequest> = {},
): Promise<MemoryProposal> {
  const proposal = await seedProposal(deps, input);

  await deps.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  return proposal;
}
