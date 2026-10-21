import type { Kysely } from 'kysely';
import type { MemoryProposalRow } from './gate-types';
import { MemoryProposalNotFoundError } from './memory-proposal-not-found-error';
import { ProposalClosedError } from './proposal-closed-error';
import { ProposalHashError } from './proposal-hash-error';
import type { MemoryTables } from './types';

export interface PendingRequirement {
  readonly proposalID: string;
  readonly actionHash: string;

  readonly now: number;
}

export async function requirePendingProposal(
  db: Kysely<MemoryTables>,
  requirement: PendingRequirement,
): Promise<MemoryProposalRow> {
  const row = await db
    .selectFrom('memory_proposals')
    .selectAll()
    .where('proposal_id', '=', requirement.proposalID)
    .executeTakeFirst();

  if (row === undefined) {
    throw new MemoryProposalNotFoundError(requirement.proposalID);
  }

  if (row.status !== 'pending') {
    throw new ProposalClosedError(row.proposal_id, row.status);
  }

  if (row.lapse_at <= requirement.now) {
    throw new ProposalClosedError(row.proposal_id, 'lapsed');
  }

  if (row.action_hash !== requirement.actionHash) {
    throw new ProposalHashError(row.proposal_id);
  }

  return row;
}
