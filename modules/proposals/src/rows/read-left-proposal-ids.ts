import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { proposalsProposerLeftCodec } from '../records/proposals-proposer-left-codec';

const rowSchema = z.object({ proposal_id: z.string() });

// The proposals that these threads took their stake back from.
export async function readLeftProposalIDs(
  db: Kysely<unknown>,
  threads: readonly string[],
): Promise<ReadonlySet<string>> {
  if (threads.length === 0) {
    return new Set();
  }

  const left = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(sql`json_extract(payload, '$.proposalID')`.as('proposal_id'))
    .where('kind', '=', proposalsProposerLeftCodec.kind)
    .where('thread', 'in', [...threads])
    .execute();

  return new Set(left.map((record) => rowSchema.parse(record).proposal_id));
}
