import type { Kysely } from 'kysely';
import type { ConsolidationChangeRow, ConsolidationTables } from './consolidation-types';
import { MemoryProposalNotFoundError } from './memory-proposal-not-found-error';
import { ProposalClosedError } from './proposal-closed-error';
import { ProposalHashError } from './proposal-hash-error';

export interface PendingChangeRequirement {
  readonly changeID: string;
  readonly actionHash: string;

  readonly now: number;
}

export async function requirePendingChange(
  db: Kysely<ConsolidationTables>,
  requirement: PendingChangeRequirement,
): Promise<ConsolidationChangeRow> {
  const row = await db
    .selectFrom('memory_consolidation_changes')
    .selectAll()
    .where('change_id', '=', requirement.changeID)
    .executeTakeFirst();

  if (row === undefined) {
    throw new MemoryProposalNotFoundError(requirement.changeID);
  }

  if (row.status !== 'pending') {
    throw new ProposalClosedError(row.change_id, row.status);
  }

  if (row.lapse_at <= requirement.now) {
    throw new ProposalClosedError(row.change_id, 'lapsed');
  }

  if (row.action_hash !== requirement.actionHash) {
    throw new ProposalHashError(row.change_id);
  }

  return row;
}
