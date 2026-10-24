import type { Log } from '@heynixie/log';
import { parseItemCursor } from './parse-item-cursor';
import { readViewItems } from './read-view-items';
import { subjectColumn } from './subject-column';
import type { MemoryState, MemoryTables } from './types';
import type { ViewListState, ViewPage, ViewPageRequest } from './view-types';

const defaultLimit = 50;
const maxLimit = 100;

const statesByList: Readonly<Record<ViewListState, readonly MemoryState[]>> = {
  active: ['active'],
  retired: ['retired'],
  forgotten: ['forgetting', 'forgotten'],
};

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
    .$if(request.after !== undefined, (listed) =>
      listed.where('created_sequence', '<', parseItemCursor(request.after)),
    )
    .$if(request.subjects !== undefined, (listed) =>
      listed.where(subjectColumn, 'in', request.subjects ?? []),
    )
    .orderBy('created_sequence', 'desc')
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
