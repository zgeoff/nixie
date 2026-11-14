import type { LogTables } from '@heynixie/log';
import { proposalLapseMs, readProposalLapses } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { RuleProposal } from './build-rule-proposal';
import type { RuleProposalOutcome } from './rule-proposal-outcomes';
import { ruleProposalOutcomes } from './rule-proposal-outcomes';
import { ruleProposalSchema } from './rule-proposal-schema';

export interface RuleProposalState {
  readonly proposal: RuleProposal;
  readonly proposedAt: number;
  readonly lapseAt: number;
  readonly outcome: RuleProposalOutcome | null;
}

const proposalIDColumn = sql`json_extract(payload, '$.proposalID')`;

export async function readRuleProposals(
  db: Kysely<unknown>,
): Promise<readonly RuleProposalState[]> {
  const records = db.$extendTables<LogTables>();

  const proposed = await records
    .selectFrom('records')
    .select(['recorded_at', 'payload', proposalIDColumn.as('proposal_id')])
    .where('kind', '=', 'rules.change_proposed')
    .orderBy('sequence')
    .execute();

  if (proposed.length === 0) {
    return [];
  }

  const closing = await records
    .selectFrom('records')
    .select(['kind', proposalIDColumn.as('proposal_id')])
    .where('kind', 'in', [...ruleProposalOutcomes.keys()])
    .execute();

  const closed = new Map(
    closing.map((row) => [row.proposal_id, ruleProposalOutcomes.get(row.kind) ?? null]),
  );

  // A defer moves a lapse, so the shared row holds the time that counts.
  const lapses = await readProposalLapses(
    db,
    proposed.map((row) => String(row.proposal_id)),
  );

  return proposed.map((row) => ({
    proposal: ruleProposalSchema.parse(JSON.parse(row.payload)),
    proposedAt: row.recorded_at,
    lapseAt: lapses.get(String(row.proposal_id)) ?? row.recorded_at + proposalLapseMs,
    outcome: closed.get(row.proposal_id) ?? null,
  }));
}
