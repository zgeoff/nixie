import { defaultGateLimits } from '../gate/default-gate-limits';
import type { MemoryProposal } from '../gate/gate-context';
import type { ProposalRequest } from './create-proposal';
import { lapseTestProposal } from './lapse-test-proposal';
import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedProposal } from './seed-proposal';

export async function seedLapsedProposal(
  deps: MemorySeederDeps,
  input: Partial<ProposalRequest> = {},
): Promise<MemoryProposal> {
  const proposal = await seedProposal(deps, input);

  deps.clock.advance(defaultGateLimits.proposalLapseMs);

  await lapseTestProposal(deps, proposal.proposalID);

  await deps.store.proposals.lapse();

  return proposal;
}
