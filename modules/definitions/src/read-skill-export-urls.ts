import type { Kysely } from 'kysely';
import type { DefinitionsTables } from './types';

export async function readSkillExportURLs(
  db: Kysely<unknown>,
): Promise<ReadonlyMap<string, string>> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('skill_exports')
    .select(['approval_id', 'pull_request_url'])
    .where('state', '=', 'opened')
    .execute();

  return new Map(rows.map((row) => [row.approval_id, row.pull_request_url]));
}
