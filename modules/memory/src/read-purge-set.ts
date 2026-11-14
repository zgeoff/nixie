import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { MemoryTables } from './types';

export async function readPurgeSet(
  db: Kysely<unknown>,
  recordSequence: number,
): Promise<readonly string[]> {
  const tables = db.$extendTables<MemoryTables>();

  const [versions, proposals] = await Promise.all([
    tables
      .selectFrom('memory_versions')
      .select('item_id')
      .where((eb) =>
        eb.or([
          eb(sql`json_extract(evidence, '$.recordSequence')`, '=', recordSequence),
          eb(sql`json_extract(intent_evidence, '$.recordSequence')`, '=', recordSequence),
        ]),
      )
      .execute(),
    tables
      .selectFrom('memory_proposals')
      .select(['item_id', 'status'])
      .where((eb) => eb(sql`json_extract(evidence, '$.recordSequence')`, '=', recordSequence))
      .execute(),
  ]);

  const pendingIDs = new Set(
    proposals.filter((row) => row.status === 'pending').map((row) => row.item_id),
  );

  const candidates = [
    ...new Set([...versions.map((row) => row.item_id), ...proposals.map((row) => row.item_id)]),
  ];

  if (candidates.length === 0) {
    return [];
  }

  const items = await tables
    .selectFrom('memory_items')
    .select(['item_id', 'state'])
    .where('item_id', 'in', candidates)
    .execute();

  const states = new Map(items.map((row) => [row.item_id, row.state]));

  return candidates
    .filter((itemID) => {
      const state = states.get(itemID);

      return state === undefined
        ? pendingIDs.has(itemID)
        : state === 'active' || state === 'retired';
    })
    .toSorted();
}
