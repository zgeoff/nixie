import type { Log } from '@heynixie/log';
import type { MemoryNotice, NoticeEntry } from './gate-types';
import { parseNoticeKey } from './parse-notice-key';
import type { BatchNotice } from './read-batch-notices';
import { readBatchNotices } from './read-batch-notices';
import { readMemoryNotices } from './read-memory-notices';
import { readViewItems } from './read-view-items';
import type { MemoryChange, MemoryTables, StoreParts } from './types';
import type { ViewNotice } from './view-types';

export async function readViewNotices(
  parts: StoreParts,
  thread: string,
): Promise<readonly ViewNotice[]> {
  const log = parts.context.log;

  const [grouped, batches] = await Promise.all([
    readMemoryNotices(parts, thread),
    readBatchNotices(log, thread),
  ]);

  const batchChanges = await readVersionChanges(
    log,
    batches.flatMap((batch) => batch.versions.map((ref) => ref.itemID)),
  );

  const notices = [
    ...grouped.map((notice) => toNoticeParts(notice)),
    ...batches.map((batch) => toBatchNoticeParts(batch, batchChanges)),
  ].toSorted((first, second) => first.sequence - second.sequence);

  const itemIDs = [
    ...new Set(notices.flatMap((notice) => notice.entries.map((entry) => entry.itemID))),
  ];

  const [items, changes] = await Promise.all([
    readViewItems(log, itemIDs),
    readCurrentChanges(log, itemIDs),
  ]);

  const byID = new Map(items.map((item) => [item.itemID, item]));

  return notices.map((notice) =>
    Object.assign(notice, {
      entries: notice.entries.map((entry) => {
        const item = byID.get(entry.itemID);
        const change = changes.get(entry.itemID);

        return Object.assign(entry, {
          item: item === undefined || change === undefined ? null : Object.assign(item, { change }),
        });
      }),
    }),
  );
}

async function readVersionChanges(
  log: Pick<Log, 'writer'>,
  itemIDs: readonly string[],
): Promise<ReadonlyMap<string, MemoryChange>> {
  if (itemIDs.length === 0) {
    return new Map();
  }

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['item_id', 'version', 'change'])
    .where('item_id', 'in', [...new Set(itemIDs)])
    .execute();

  return new Map(rows.map((row) => [`${row.item_id}/${String(row.version)}`, row.change]));
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

function toBatchNoticeParts(
  batch: BatchNotice,
  changes: ReadonlyMap<string, MemoryChange>,
): NoticeParts {
  const entries = batch.versions.flatMap((ref) => {
    const change = changes.get(`${ref.itemID}/${String(ref.version)}`);

    return change === undefined
      ? []
      : [{ ...ref, change, proposalID: null, sequence: batch.sequence }];
  });

  return {
    noticeKey: `notice/${String(batch.sequence)}`,
    kind: batch.notice,
    messageSequence: null,
    sequence: batch.sequence,
    remembered:
      batch.notice === 'catch_up'
        ? batch.count
        : entries.filter((entry) => entry.change !== 'retired').length,
    retired: entries.filter((entry) => entry.change === 'retired').length,
    proposed: 0,
    entries,
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
    .select(['item.item_id', 'current.change'])
    .where('item.item_id', 'in', itemIDs)
    .execute();

  return new Map(rows.map((row) => [row.item_id, row.change]));
}
