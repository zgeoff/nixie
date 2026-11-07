import { createShortID } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { buildRuleProposal } from './build-rule-proposal';
import type { RuleEdit } from './build-rule-seed-plan';
import { readRuleProposals } from './read-rule-proposals';
import type { RuleProposalChange } from './write-seed';

// A seed gathers every widening into one proposal, so a pending proposal for other widenings gives
// way to the new one.
export async function readRuleProposalChange(
  db: Kysely<unknown>,
  held: readonly RuleEdit[],
): Promise<RuleProposalChange> {
  const proposals = await readRuleProposals(db);

  const pending = proposals.findLast((state) => state.outcome === null);
  const proposed = held.length === 0 ? null : buildRuleProposal(createShortID(), held);

  if (pending?.proposal.proposalHash === proposed?.proposalHash) {
    return { withdrawn: null, proposed: null };
  }

  return { withdrawn: pending?.proposal.proposalID ?? null, proposed };
}
