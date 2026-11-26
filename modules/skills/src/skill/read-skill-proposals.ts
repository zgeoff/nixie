import type { LogTables } from '@heynixie/log';
import type { ProposalTables } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { SkillProposalState } from '../types';
import { skillProposalSchema } from '../utils/skill-proposal-schema';

const proposalIDColumn = sql`json_extract(payload, '$.proposalID')`;

export async function readSkillProposals(
  db: Kysely<unknown>,
  proposalIDs?: readonly string[],
): Promise<readonly SkillProposalState[]> {
  if (proposalIDs?.length === 0) {
    return [];
  }

  const records = db.$extendTables<LogTables>();

  const proposed = await records
    .selectFrom('records')
    .select(['thread', 'recorded_at', 'payload', proposalIDColumn.as('proposal_id')])
    .where('kind', '=', 'skills.write_proposed')
    .$if(proposalIDs !== undefined, (query) =>
      query.where(proposalIDColumn, 'in', proposalIDs ?? []),
    )
    .orderBy('sequence')
    .execute();

  if (proposed.length === 0) {
    return [];
  }

  // A proposal's state lives in the shared row, which every outcome of every family writes.
  const rows = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select(['proposal_id', 'state'])
    .where(
      'proposal_id',
      'in',
      proposed.map((row) => String(row.proposal_id)),
    )
    .execute();

  const closed = new Map(
    rows.flatMap((row) =>
      row.state === 'pending' || row.state === 'deferred' ? [] : [[row.proposal_id, row.state]],
    ),
  );

  return proposed.map((row) => ({
    proposal: skillProposalSchema.parse(JSON.parse(row.payload)),
    thread: row.thread,
    proposedAt: row.recorded_at,
    outcome: closed.get(String(row.proposal_id)) ?? null,
  }));
}
