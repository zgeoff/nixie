import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildProposalRecords } from './build-proposal-records';
import { ProposalCapError } from './proposal-cap-error';
import type { MemoryTables, StoreParts } from './types';
import type { ProposalPlan } from './write-memory-proposal';

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

  await writeRecordsInTransaction(tx, parts.context.log, buildProposalRecords(parts, pending));
}
