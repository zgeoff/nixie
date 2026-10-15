import type { MemoryNotice, NoticeEntry } from './gate-types';
import type { MemoryTables, StoreParts } from './types';

// Reads the grouped notices of a thread, oldest first: one per turn or batch, with a count of what
// it remembered, retired and proposed, and each entry with the version an undo binds to. An undo
// of an entry is the store's undo at that version, so a later change makes it stale.
export async function readMemoryNotices(
  parts: StoreParts,
  thread: string,
): Promise<readonly MemoryNotice[]> {
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_notice_entries')
    .selectAll()
    .where('thread', '=', thread)
    .orderBy('sequence')
    .execute();

  const notices = new Map<string, NoticeEntry[]>();

  for (const row of rows) {
    const entries = notices.get(row.notice_key) ?? [];

    entries.push({
      itemID: row.item_id,
      change: row.change,
      version: row.version,
      proposalID: row.proposal_id,
    });

    notices.set(row.notice_key, entries);
  }

  return [...notices.entries()].map(([noticeKey, entries]) => ({
    noticeKey,
    thread,
    remembered: entries.filter((entry) => entry.change === 'created' || entry.change === 'edited')
      .length,
    retired: entries.filter((entry) => entry.change === 'retired').length,
    proposed: entries.filter((entry) => entry.change === 'proposed').length,
    entries,
  }));
}
