import { createShortID } from '@heynixie/db';
import { proposalLapseMs } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { buildRuleProposal } from './build-rule-proposal';
import type { RuleEdit } from './build-rule-seed-plan';
import type { HeldEffects } from './pick-seed-effects';
import { readRuleProposals } from './read-rule-proposals';
import type { DefinitionsTables } from './types';
import type { RuleProposalChange } from './write-seed';

// A pending proposal gives way to a new set of widenings. A set you rejected or left to lapse, even
// before a log reset, waits for the definitions to change it. An approved set held again was
// narrowed since, so it asks again.
export async function readRuleProposalChange(
  db: Kysely<unknown>,
  held: readonly RuleEdit[],
  heldEffects: readonly HeldEffects[],
  now: number,
): Promise<RuleProposalChange> {
  const proposals = await readRuleProposals(db);

  const pending = proposals.findLast(
    (state) => state.outcome === null && state.proposedAt + proposalLapseMs > now,
  );

  const proposed =
    held.length === 0 && heldEffects.length === 0
      ? null
      : buildRuleProposal(createShortID(), held, heldEffects);

  if (pending?.proposal.proposalHash === proposed?.proposalHash) {
    return { withdrawn: null, proposed: null };
  }

  const closed = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('closed_rule_proposals')
    .select('proposal_hash')
    .where('proposal_hash', '=', proposed?.proposalHash ?? '')
    .executeTakeFirst();

  const isAsked =
    closed !== undefined ||
    proposals.some(
      (state) =>
        state.outcome !== 'withdrawn' &&
        state.outcome !== 'approved' &&
        state.proposal.proposalHash === proposed?.proposalHash,
    );

  return { withdrawn: pending?.proposal.proposalID ?? null, proposed: isAsked ? null : proposed };
}
