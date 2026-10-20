import type { Kysely } from 'kysely';
import type { DefinitionsTables } from './types';

// Reads the open pull request that carries each skill nixie wrote to your definitions repo, by the
// approval that applied the skill. An export again on a new base keeps its pull request open. An
// approval with no export, a first export in flight, or a closed export is missing.
export async function readSkillExportURLs(
  db: Kysely<unknown>,
): Promise<ReadonlyMap<string, string>> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('skill_exports')
    .select(['approval_id', 'pull_request_url'])
    .where('state', 'in', ['exporting', 'opened'])
    .execute();

  return new Map(
    rows.flatMap((row) =>
      row.pull_request_url === null ? [] : [[row.approval_id, row.pull_request_url] as const],
    ),
  );
}
