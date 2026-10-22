import type { Log } from '@heynixie/log';
import { parseNoticeKey } from './parse-notice-key';
import { readMemoryNotices } from './read-memory-notices';
import { readViewItems } from './read-view-items';
import type { MemoryChange, MemoryTables, StoreParts } from './types';
import type { ViewNotice } from './view-types';

export async function readViewNotices(
  parts: StoreParts,
  thread: string,
): Promise<readonly ViewNotice[]> {
  const notices = await readMemoryNotices(parts, thread);

  const itemIDs = [
    ...new Set(notices.flatMap((notice) => notice.entries.map((entry) => entry.itemID))),
  ];

  const [items, changes] = await Promise.all([
    readViewItems(parts.context.log, itemIDs),
    readCurrentChanges(parts.context.log, itemIDs),
  ]);

  const byID = new Map(items.map((item) => [item.itemID, item]));

  return notices.map((notice) => {
    const key = parseNoticeKey(notice.noticeKey);

    return {
      noticeKey: notice.noticeKey,
      kind: key.kind,
      messageSequence: key.messageSequence,
      remembered: notice.remembered,
      retired: notice.retired,
      proposed: notice.proposed,
      entries: notice.entries.map((entry) => {
        const item = byID.get(entry.itemID);
        const change = changes.get(entry.itemID);

        return {
          itemID: entry.itemID,
          change: entry.change,
          version: entry.version,
          proposalID: entry.proposalID,
          sequence: entry.sequence,
          item: item === undefined || change === undefined ? null : Object.assign(item, { change }),
        };
      }),
    };
  });
}

async function readCurrentChanges(
  log: Pick<Log, 'writer'>,
  itemIDs: readonly string[],
): Promise<ReadonlyMap<string, MemoryChange>> {
  if (itemIDs.length === 0) {
    return new Map();
  }

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items as item')
    .innerJoin('memory_versions as current', (join) =>
      join
        .onRef('current.item_id', '=', 'item.item_id')
        .onRef('current.version', '=', 'item.version'),
    )
    .select(['item.item_id', 'current.change'])
    .where('item.item_id', 'in', itemIDs)
    .execute();

  return new Map(rows.map((row) => [row.item_id, row.change]));
}
