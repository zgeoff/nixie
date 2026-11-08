import type { Kysely } from 'kysely';
import type { ForgetStatus, MemoryTables } from './types';

export async function readForgetStatus(
  db: Kysely<MemoryTables>,
  itemIDs: readonly string[],
): Promise<ForgetStatus> {
  const rows = await db
    .selectFrom('memory_items')
    .select(['item_id', 'state', 'forgotten_sequence'])
    .where('item_id', 'in', itemIDs)
    .execute();

  const states = new Map(rows.map((row) => [row.item_id, row.state]));

  const sequences = rows.flatMap((row) => row.forgotten_sequence ?? []);

  return {
    deleted: itemIDs.filter((itemID) => states.get(itemID) === 'forgotten'),
    pending: itemIDs.filter((itemID) => states.get(itemID) === 'forgetting'),
    forgottenSequence: sequences.length === 0 ? null : Math.max(...sequences),
  };
}
