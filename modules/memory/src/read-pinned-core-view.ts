import { countPinnedCoreTokens } from './count-pinned-core-tokens';
import { getPinnedCoreBudget } from './get-pinned-core-budget';
import { readPinnedItems } from './read-pinned-items';
import { readViewItems } from './read-view-items';
import type { MemoryTables, StoreParts } from './types';
import type { PinnedCoreView } from './view-types';

// Reads the pinned core as the memory view shows it: every pinned active item in the order you
// pinned them, one whose text fails to open included, so you can still see and unpin it, and the
// size of the readable items that a session's opening holds, counted as a pin counts it.
export async function readPinnedCoreView(parts: StoreParts): Promise<PinnedCoreView> {
  const log = parts.context.log;

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('is_pinned', '=', 1)
    .where('state', '=', 'active')
    .orderBy('pinned_sequence')
    .execute();

  const [items, readable] = await Promise.all([
    readViewItems(
      log,
      rows.map((row) => row.item_id),
    ),
    readPinnedItems(parts),
  ]);

  return {
    items,
    tokens: countPinnedCoreTokens(parts.context, readable),
    budget: getPinnedCoreBudget(parts.context),
  };
}
