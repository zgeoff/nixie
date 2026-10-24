import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { promptProposalOutcomes } from './prompt-proposal-outcomes';
import { promptProposalSchema } from './prompt-proposal-schema';
import type { PromptProposalState } from './types';

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

  const closing = await records
    .selectFrom('records')
    .select(['kind', proposalIDColumn.as('proposal_id')])
    .where('kind', 'in', [...promptProposalOutcomes.keys()])
    .where(
      proposalIDColumn,
      'in',
      proposed.map((row) => row.proposal_id),
    )
    .execute();

  const closed = new Map(
    closing.map((row) => [row.proposal_id, promptProposalOutcomes.get(row.kind) ?? null]),
  );

  return proposed.map((row) => ({
    proposal: promptProposalSchema.parse(JSON.parse(row.payload)),
    thread: row.thread,
    proposedAt: row.recorded_at,
    outcome: closed.get(row.proposal_id) ?? null,
  }));
}
