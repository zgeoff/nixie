import { proposalLapseMs, readProposalLapses } from '@heynixie/proposals';
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

  // A defer moves a lapse, so the shared row holds the time that counts.
  const lapses = await readProposalLapses(
    db,
    proposals.map((entry) => entry.proposal.proposalID),
  );

  return proposals.flatMap((entry) => {
    const lapseAt = lapses.get(entry.proposal.proposalID) ?? entry.proposedAt + proposalLapseMs;

    return entry.outcome === null && lapseAt > now
      ? [{ proposal: entry.proposal, proposedAt: entry.proposedAt, lapseAt }]
      : [];
  });
}
