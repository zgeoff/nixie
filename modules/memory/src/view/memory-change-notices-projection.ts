import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { MemoryChangeNoticeTable } from '../gate/gate-context';
import type { MemoryTables } from '../types';
import { parseLabelRecord } from '../utils/record/parse-label-record';
import { parsePinNoticeRecord } from '../utils/record/parse-pin-notice-record';

// The notice entries of a label edit, a pin and an unpin sit apart from memory_notice_entries,
// whose change check the release before still reads and refuses these changes in.
export const memoryChangeNoticesProjection: Projection = {
  table: 'memory_change_notices',
  keyColumn: 'entry_key',
  fold: async (tx, record) => {
    const entry = buildChangeNotice(record);

    if (entry === null) {
      return [];
    }

    await tx
      .$extendTables<MemoryTables>()
      .insertInto('memory_change_notices')
      .values({
        ...entry,
        thread: record.thread,
        sequence: record.sequence,
        recorded_at: record.recordedAt.getTime(),
      })
      .execute();

    return [entry.entry_key];
  },
};

type ChangeNoticeValues = Pick<
  MemoryChangeNoticeTable,
  'entry_key' | 'notice_key' | 'item_id' | 'change'
>;

function buildChangeNotice(record: EnvelopeRecord): ChangeNoticeValues | null {
  const pinned = parsePinNoticeRecord(record);

  if (pinned !== null) {
    return {
      entry_key: `pin/${String(record.sequence)}`,
      notice_key: pinned.noticeKey,
      item_id: pinned.itemID,
      change: pinned.isPinned ? 'pinned' : 'unpinned',
    };
  }

  const labelled = parseLabelRecord(record);

  if (labelled?.kind === 'memory.labelled' && labelled.noticeKey !== null) {
    return {
      entry_key: `labelled/${labelled.itemID}/${String(labelled.revision)}`,
      notice_key: labelled.noticeKey,
      item_id: labelled.itemID,
      change: 'labelled',
    };
  }

  return null;
}
