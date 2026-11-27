import type { ErasureBy, LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import type { MemoryContext, MemoryTables } from '../../types';
import type { ItemErasureRequest } from './build-item-erasable';

// An item that an earlier release's forget left in forgetting, with no erasure.started to finish
// it. Only the owner could forget an item then, and the earlier release recorded no actor.
export async function readLegacyOpenItemForgets(
  context: Pick<MemoryContext, 'log'>,
): Promise<readonly { request: ItemErasureRequest; by: ErasureBy }[]> {
  const rows = await context.log.writer.db
    .$extendTables<MemoryTables & LogTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('state', '=', 'forgetting')
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('records')
            .select('sequence')
            .where('kind', '=', 'erasure.started')
            .where(sql`json_extract(payload, '$.targetID')`, '=', sql`memory_items.item_id`),
        ),
      ),
    )
    .orderBy('updated_sequence')
    .execute();

  return rows.map((row) => ({
    request: { itemID: row.item_id, revision: null, states: ['forgetting'], isResuming: true },
    by: 'user',
  }));
}
