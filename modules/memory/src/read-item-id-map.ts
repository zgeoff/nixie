import { getItemShortID } from './get-item-short-id';
import type { MemoryTables, StoreParts } from './types';

export async function readItemIDMap(
  parts: StoreParts,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id'])
    .where((eb) =>
      eb.or([eb('short_id', 'in', ids), eb('item_id', 'in', ids), eb('short_id', 'is', null)]),
    )
    .execute();

  const byID = new Map(
    rows.flatMap((row) => [
      [getItemShortID(row), row.item_id],
      [row.item_id, row.item_id],
    ]),
  );

  return new Map(
    ids.flatMap((id) => {
      const itemID = byID.get(id);

      return itemID === undefined ? [] : [[id, itemID] as const];
    }),
  );
}
