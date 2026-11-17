import type { MemoryNotice, NoticeEntry } from '../gate/gate-context';
import type { MemoryTables, StoreParts } from '../types';

export async function readMemoryNotices(
  parts: StoreParts,
  thread: string,
): Promise<readonly MemoryNotice[]> {
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();

  const [entryRows, changeRows] = await Promise.all([
    db
      .selectFrom('memory_notice_entries')
      .select(['notice_key', 'item_id', 'change', 'version', 'proposal_id', 'sequence'])
      .where('thread', '=', thread)
      .execute(),
    db
      .selectFrom('memory_change_notices')
      .select(['notice_key', 'item_id', 'change', 'sequence'])
      .where('thread', '=', thread)
      .execute(),
  ]);

  const rows = [
    ...entryRows,
    ...changeRows.map((row) => Object.assign(row, { version: null, proposal_id: null })),
  ].toSorted((first, second) => first.sequence - second.sequence);

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
