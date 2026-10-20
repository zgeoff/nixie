import type { Log } from '@heynixie/log';
import { parseItemCursor } from './parse-item-cursor';
import { readViewItems } from './read-view-items';
import type { MemoryState, MemoryTables } from './types';
import type { ViewListState, ViewPage, ViewPageRequest } from './view-types';

const defaultLimit = 50;
const maxLimit = 100;

const statesByList: Readonly<Record<ViewListState, readonly MemoryState[]>> = {
  active: ['active'],
  retired: ['retired'],
  forgotten: ['forgetting', 'forgotten'],
};

// Reads one page of the items in a state, in the order they were created. The forgotten page holds
// each item a forget began, so an item whose forget a crash cut short still shows as a gap.
export async function readViewPage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: ViewPageRequest,
): Promise<ViewPage> {
  const limit = Math.min(request.limit ?? defaultLimit, maxLimit);

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'created_sequence'])
    .where('state', 'in', statesByList[request.state])
    .where('created_sequence', '>', parseItemCursor(request.after))
    .orderBy('created_sequence')
    .limit(limit + 1)
    .execute();

  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    items: await readViewItems(
      log,
      page.map((row) => row.item_id),
    ),
    next: rows.length > limit && last !== undefined ? String(last.created_sequence) : null,
  };
}
