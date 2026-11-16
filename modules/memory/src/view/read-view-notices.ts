import type { Log } from '@heynixie/log';
import type { MemoryNotice, NoticeEntry } from '../gate/gate-context';
import { isBridgeVersion, readBridgeMarks } from '../item-key/read-bridge-marks';
import { readMemoryNotices } from '../memory/read-memory-notices';
import type { MemoryChange, MemoryTables, StoreParts } from '../types';
import type { ViewNotice } from './memory-view';
import { parseNoticeKey } from './parse-notice-key';
import { readViewItems } from './read-view-items';

export async function readViewNotices(
  parts: StoreParts,
  thread: string,
): Promise<readonly ViewNotice[]> {
  const log = parts.context.log;

  const grouped = await readMemoryNotices(parts, thread);

  const notices = grouped
    .map((notice) => toNoticeParts(notice))
    .toSorted((first, second) => first.sequence - second.sequence);

  const itemIDs = [
    ...new Set(notices.flatMap((notice) => notice.entries.map((entry) => entry.itemID))),
  ];

  const [items, changes, labelEdits] = await Promise.all([
    readViewItems(log, itemIDs),
    readCurrentChanges(log, itemIDs),
    readLabelEdits(log, itemIDs),
  ]);

  const byID = new Map(items.map((item) => [item.itemID, item]));

  return notices.map((notice) =>
    Object.assign(notice, {
      entries: notice.entries.map((entry) => {
        const item = byID.get(entry.itemID);
        const change = changes.get(entry.itemID);

        return Object.assign(entry, {
          version: toEntryRevision(entry, labelEdits),
          item: item === undefined || change === undefined ? null : Object.assign(item, { change }),
        });
      }),
    }),
  );
}

type NoticeParts = Omit<ViewNotice, 'entries'> & { readonly entries: readonly NoticeEntry[] };

function toNoticeParts(notice: MemoryNotice): NoticeParts {
  const key = parseNoticeKey(notice.noticeKey);

  return {
    noticeKey: notice.noticeKey,
    kind: key.kind,
    messageSequence: key.messageSequence,
    sequence: Math.max(...notice.entries.map((entry) => entry.sequence)),
    remembered: notice.remembered,
    retired: notice.retired,
    proposed: notice.proposed,
    entries: notice.entries,
  };
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
    .select(['item.item_id', 'current.version', 'current.change'])
    .where('item.item_id', 'in', itemIDs)
    .execute();

  const marks = await readBridgeMarks(log.writer.db, itemIDs);

  const changes = await Promise.all(
    rows.map(async (row): Promise<readonly [string, MemoryChange]> => {
      const isBridge = isBridgeVersion(marks, row.item_id, row.version);

      return [row.item_id, isBridge ? await readChangeBefore(log, row) : row.change];
    }),
  );

  return new Map(changes);
}

// A bridge version that a purge wrote copies the version before it, which holds the change that a
// notice reports.
interface CurrentChange {
  readonly item_id: string;
  readonly version: number;
  readonly change: MemoryChange;
}

async function readChangeBefore(
  log: Pick<Log, 'writer'>,
  row: CurrentChange,
): Promise<MemoryChange> {
  const before = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('change')
    .where('item_id', '=', row.item_id)
    .where('version', '=', row.version - 1)
    .executeTakeFirst();

  return before?.change ?? row.change;
}

interface LabelEdit {
  readonly itemID: string;
  readonly version: number;
}

async function readLabelEdits(
  log: Pick<Log, 'writer'>,
  itemIDs: readonly string[],
): Promise<readonly LabelEdit[]> {
  if (itemIDs.length === 0) {
    return [];
  }

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_labels')
    .select(['item_id', 'version'])
    .where('item_id', 'in', itemIDs)
    .where('change', '=', 'edited')
    .execute();

  return rows.map((row) => ({ itemID: row.item_id, version: row.version }));
}

function toEntryRevision(entry: NoticeEntry, labelEdits: readonly LabelEdit[]): number | null {
  if (entry.version === null) {
    return null;
  }

  const textVersion = entry.version;

  return (
    textVersion +
    labelEdits.filter((edit) => edit.itemID === entry.itemID && edit.version < textVersion).length
  );
}
