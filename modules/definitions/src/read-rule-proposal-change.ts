import { createShortID } from '@heynixie/db';
import { proposalLapseMs } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { buildRuleProposal } from './build-rule-proposal';
import type { RuleEdit } from './build-rule-seed-plan';
import { readRuleProposals } from './read-rule-proposals';
import type { RuleProposalChange } from './write-seed';

// A seed gathers every widening into one proposal, so a pending proposal for other widenings gives
// way to the new one. A set of widenings you answered, or left to lapse, waits for the definitions
// to change it before nixie asks again.
export async function readRuleProposalChange(
  db: Kysely<unknown>,
  held: readonly RuleEdit[],
  now: number,
): Promise<RuleProposalChange> {
  const proposals = await readRuleProposals(db);

  const pending = proposals.findLast(
    (state) => state.outcome === null && state.proposedAt + proposalLapseMs > now,
  );

  const proposed = held.length === 0 ? null : buildRuleProposal(createShortID(), held);

  if (pending?.proposal.proposalHash === proposed?.proposalHash) {
    return { withdrawn: null, proposed: null };
  }

  const isAsked = proposals.some(
    (state) =>
      state.outcome !== 'withdrawn' && state.proposal.proposalHash === proposed?.proposalHash,
  );

  return { withdrawn: pending?.proposal.proposalID ?? null, proposed: isAsked ? null : proposed };
}
