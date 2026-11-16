import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ProposalPlan } from '../memory/write-memory-proposal';
import type { MemoryTables, StoreParts } from '../types';
import { ProposalCapError } from '../utils/error/proposal-cap-error';
import { buildProposalRecords } from './build-proposal-records';

export interface SealedProposal {
  readonly proposalID: string;
  readonly itemID: string;
  readonly sealed: string;
  readonly actionHash: string;

  // the plan's labels under the item's key, for a proposal that has them
  readonly sealedLabels?: string;
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
