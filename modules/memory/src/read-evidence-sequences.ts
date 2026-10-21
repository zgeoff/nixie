import type { Kysely } from 'kysely';
import { parseEvidence } from './parse-evidence';
import type { MemoryTables } from './types';

export async function readEvidenceSequences(
  db: Kysely<MemoryTables>,
  itemID: string,
): Promise<readonly number[]> {
  const versions = await db
    .selectFrom('memory_versions')
    .select(['evidence', 'intent_evidence'])
    .where('item_id', '=', itemID)
    .execute();

  const proposals = await db
    .selectFrom('memory_proposals')
    .select('evidence')
    .where('item_id', '=', itemID)
    .execute();

  const columns = [
    ...versions.flatMap((row) => [row.evidence, row.intent_evidence]),
    ...proposals.map((row) => row.evidence),
  ];

  return [
    ...new Set(columns.flatMap((column) => parseEvidence(column)?.recordSequence ?? [])),
  ].toSorted((left, right) => left - right);
}
