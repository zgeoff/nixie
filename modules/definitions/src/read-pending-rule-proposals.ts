import { proposalLapseMs } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import type { RuleProposal } from './build-rule-proposal';
import { readRuleProposals } from './read-rule-proposals';

export interface PendingRuleProposal {
  readonly proposal: RuleProposal;
  readonly proposedAt: number;
  readonly lapseAt: number;
}

export async function readPendingRuleProposals(
  db: Kysely<unknown>,
  now: number,
): Promise<readonly PendingRuleProposal[]> {
  const proposals = await readRuleProposals(db);

  return proposals.flatMap((entry) => {
    const lapseAt = entry.proposedAt + proposalLapseMs;

    return entry.outcome === null && lapseAt > now
      ? [{ proposal: entry.proposal, proposedAt: entry.proposedAt, lapseAt }]
      : [];
  });
}
