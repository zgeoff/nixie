import type { LogTables } from '@heynixie/log';
import { readProposalLapses, readProposalStates } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { RuleProposal } from '../utils/rule-proposal-schema';
import { ruleProposalSchema } from '../utils/rule-proposal-schema';

export interface RuleProposalState {
  readonly proposal: RuleProposal;
  readonly proposedAt: number;
  readonly lapseAt: number;
  readonly outcome: 'approved' | 'declined' | 'lapsed' | 'withdrawn' | null;
}

// the wait that a rule change had before the config set one
const legacyLapseMs = 14 * 24 * 60 * 60 * 1000;
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

  const ids = proposed.map((row) => String(row.proposal_id));

  const states = await readProposalStates(db, ids);

  // A defer moves a lapse, so the shared row holds the time that counts.
  const lapses = await readProposalLapses(db, ids);

  return proposed.map((row) => ({
    proposal: ruleProposalSchema.parse(JSON.parse(row.payload)),
    proposedAt: row.recorded_at,
    lapseAt: lapses.get(String(row.proposal_id)) ?? row.recorded_at + legacyLapseMs,
    outcome: toOutcome(states.get(String(row.proposal_id))),
  }));
}

function toOutcome(state: string | undefined): RuleProposalState['outcome'] {
  return state === 'approved' || state === 'declined' || state === 'lapsed' || state === 'withdrawn'
    ? state
    : null;
}
