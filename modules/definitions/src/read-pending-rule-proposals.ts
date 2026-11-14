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

  return proposals.flatMap((entry) =>
    entry.outcome === null && entry.lapseAt > now
      ? [{ proposal: entry.proposal, proposedAt: entry.proposedAt, lapseAt: entry.lapseAt }]
      : [],
  );
}
