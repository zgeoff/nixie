import type { MemoryNotice, NoticeEntry } from './gate-types';
import type { MemoryTables, StoreParts } from './types';

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
      sequence: row.sequence,
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
