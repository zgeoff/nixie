import { withWriteTransaction } from '@heynixie/log';
import type { MemoryProposal } from '../gate-context';
import type { ProposalRequest } from './create-proposal';
import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedProposal } from './seed-proposal';

export async function seedProposalWithLaterReason(
  deps: MemorySeederDeps,
  input: Partial<ProposalRequest> = {},
): Promise<MemoryProposal> {
  const proposal = await seedProposal(deps, input);

  // A pending proposal whose review_reason is quote_too_old, a value a later release writes: no
  // code here writes it.
  await withWriteTransaction(deps.log.writer, (tx) =>
    tx
      .$extendTables<{ memory_proposals: { review_reason: string; proposal_id: string } }>()
      .updateTable('memory_proposals')
      .set({ review_reason: 'quote_too_old' })
      .where('proposal_id', '=', proposal.proposalID)
      .execute(),
  );

  return proposal;
}
