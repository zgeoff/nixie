import type { ProposalTables } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import type { MemoryProposalRow } from '../gate/gate-context';
import type { MemoryTables } from '../types';
import { MemoryProposalNotFoundError } from '../utils/error/memory-proposal-not-found-error';
import { ProposalClosedError } from '../utils/error/proposal-closed-error';
import { ProposalHashError } from '../utils/error/proposal-hash-error';

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

  const shared = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select(['state', 'lapses_at'])
    .where('proposal_id', '=', requirement.proposalID)
    .executeTakeFirst();

  if (shared !== undefined && shared.state !== 'pending' && shared.state !== 'deferred') {
    throw new ProposalClosedError(row.proposal_id, shared.state);
  }

  if (shared !== undefined && shared.lapses_at <= requirement.now) {
    throw new ProposalClosedError(row.proposal_id, 'lapsed');
  }

  if (row.action_hash !== requirement.actionHash) {
    throw new ProposalHashError(row.proposal_id);
  }

  return row;
}
