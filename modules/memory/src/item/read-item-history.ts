import { isBridgeVersion, readBridgeMarks } from '../item-key/read-bridge-marks';
import type { MemoryTables, MemoryVersionRow, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import type { VersionValue } from '../version/read-version-values';
import { readVersionValues } from '../version/read-version-values';
import type { HistoryVersion, ItemHistory } from '../view/memory-view';

export async function readItemHistory(
  parts: StoreParts,
  itemID: string,
): Promise<ItemHistory | null> {
  const log = parts.context.log;
  const db = log.writer.db.$extendTables<MemoryTables>();

  const item = await db
    .selectFrom('memory_items')
    .select(['state', 'kind', 'subject'])
    .where('item_id', '=', itemID)
    .executeTakeFirst();

  if (item === undefined) {
    return null;
  }

  const rows = await db
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', '=', itemID)
    .orderBy('version')
    .execute();

  const values = await readVersionValues(log, log.writer.db, rows);
  const marks = await readBridgeMarks(log.writer.db, [itemID]);

  const versions = rows.map((row, index) =>
    buildHistoryVersion(row, values[index], isBridgeVersion(marks, itemID, row.version)),
  );

  return { itemID, state: item.state, subject: getRowSubject(item), versions };
}

function buildHistoryVersion(
  row: MemoryVersionRow,
  value: VersionValue | undefined,
  isBridge: boolean,
): HistoryVersion {
  const base = {
    version: row.version,
    change: row.change,
    state: row.state,
    origin: row.origin,
    source: row.source,
    recordedAt: row.recorded_at,
    isRemoved: value?.status === 'removed',
    isBridge,
  };

  if (value?.status === 'readable') {
    return { ...base, status: 'readable', text: value.text.text };
  }

  return { ...base, status: value?.status === 'unreadable' ? 'unreadable' : 'shredded' };
}
