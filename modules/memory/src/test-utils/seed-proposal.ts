import type { MemoryProposal } from '../gate/gate-context';
import type { ProposalRequest } from './create-proposal';
import { createProposal } from './create-proposal';
import type { MemorySeederDeps } from './memory-seeder-deps';

export function seedProposal(
  deps: MemorySeederDeps,
  input: Partial<ProposalRequest> = {},
): Promise<MemoryProposal> {
  return createProposal(deps.store, { text: 'Likes jazz', ...input });
}
