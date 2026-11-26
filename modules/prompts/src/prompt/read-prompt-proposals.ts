import type { LogTables } from '@heynixie/log';
import { readProposalStates } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { PromptProposalState } from '../types';
import { promptProposalSchema } from './prompt-proposal-schema';

const proposalIDColumn = sql`json_extract(payload, '$.proposalID')`;

export async function readPromptProposals(
  db: Kysely<unknown>,
  proposalIDs?: readonly string[],
): Promise<readonly PromptProposalState[]> {
  if (proposalIDs?.length === 0) {
    return [];
  }

  const records = db.$extendTables<LogTables>();

  const proposed = await records
    .selectFrom('records')
    .select(['thread', 'recorded_at', 'payload', proposalIDColumn.as('proposal_id')])
    .where('kind', '=', 'prompts.override_proposed')
    .$if(proposalIDs !== undefined, (query) =>
      query.where(proposalIDColumn, 'in', proposalIDs ?? []),
    )
    .orderBy('sequence')
    .execute();

  if (proposed.length === 0) {
    return [];
  }

  const states = await readProposalStates(
    db,
    proposed.map((row) => String(row.proposal_id)),
  );

  return proposed.map((row) => ({
    proposal: promptProposalSchema.parse(JSON.parse(row.payload)),
    thread: row.thread,
    proposedAt: row.recorded_at,
    outcome: toOutcome(states.get(String(row.proposal_id))),
  }));
}

function toOutcome(state: string | undefined): PromptProposalState['outcome'] {
  return state === 'approved' || state === 'declined' || state === 'lapsed' || state === 'withdrawn'
    ? state
    : null;
}
