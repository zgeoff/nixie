import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { proposalsProposerLeftCodec } from '../records/proposals-proposer-left-codec';

// The threads of the proposers that took their stake back from one proposal.
export async function readLeftThreads(
  db: Kysely<unknown>,
  proposalID: string,
): Promise<readonly string[]> {
  const left = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('thread')
    .where('kind', '=', proposalsProposerLeftCodec.kind)
    .where(sql`json_extract(payload, '$.proposalID')`, '=', proposalID)
    .execute();

  return left.flatMap((record) => (record.thread === null ? [] : [record.thread]));
}
