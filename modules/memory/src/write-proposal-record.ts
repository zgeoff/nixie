import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildProposalRecord } from './build-proposal-record';
import { ProposalCapError } from './proposal-cap-error';
import type { MemoryTables, StoreParts } from './types';
import type { ProposalPlan } from './write-memory-proposal';

// A proposal's sealed text and action hash, ready to record.
export interface SealedProposal {
  readonly proposalID: string;
  readonly itemID: string;
  readonly sealed: string;
  readonly actionHash: string;
}

export interface PendingProposal {
  readonly plan: ProposalPlan;
  readonly sealed: SealedProposal;
}

// Records a proposal inside the caller's transaction. The cap counts every proposal of the turn,
// task run or batch, so a flood of writes stops at the cap and the write past it is refused.
export async function writeProposalRecord(
  tx: Transaction<unknown>,
  parts: StoreParts,
  pending: PendingProposal,
): Promise<void> {
  const plan = pending.plan;

  const made = await tx
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('cap_group', '=', plan.group.capGroup)
    .executeTakeFirstOrThrow();

  const limits = parts.context.gate.limits;

  if (made.count >= limits.proposalCap) {
    throw new ProposalCapError(limits.proposalCap);
  }

  await writeRecordsInTransaction(tx, parts.context.log, [buildProposalRecord(parts, pending)]);
}
