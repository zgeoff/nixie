import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import type { Selectable } from 'kysely';
import { getItemShortID } from './get-item-short-id';
import { getRowSubject } from './get-row-subject';
import { readViewText } from './read-view-text';
import type { MemoryTables } from './types';
import type { ViewItem } from './view-types';

export async function readViewItems(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  itemIDs: readonly string[],
): Promise<readonly ViewItem[]> {
  if (itemIDs.length === 0) {
    return [];
  }

  const db = log.writer.db.$extendTables<
    MemoryTables & { records: { sequence: number; recorded_at: number } }
  >();

  const rows = await db
    .selectFrom('memory_items as item')
    .innerJoin('memory_versions as current', (join) =>
      join
        .onRef('current.item_id', '=', 'item.item_id')
        .onRef('current.version', '=', 'item.version'),
    )
    .innerJoin('memory_versions as first', (join) =>
      join.onRef('first.item_id', '=', 'item.item_id').on('first.version', '=', 1),
    )
    .leftJoin('records as forgotten', 'forgotten.sequence', 'item.forgotten_sequence')
    .select([
      'item.item_id',
      'item.short_id',
      'item.state',
      'item.is_pinned',
      'item.is_sensitive',
      'item.kind',
      'item.subject',
      'item.version',
      'item.until',
      'current.origin',
      'current.source',
      'current.sealed',
      'current.recorded_at as changed_at',
      'first.recorded_at as created_at',
      'forgotten.recorded_at as forgotten_at',
    ])
    .where('item.item_id', 'in', itemIDs)
    .execute();

  const keys = await readRecordKeys(
    log,
    rows.map((row) => row.item_id),
  );

  const byID = new Map(rows.map((row) => [row.item_id, row]));

  const found = itemIDs.flatMap((itemID) => byID.get(itemID) ?? []);

  return Promise.all(found.map((row) => openViewItem(row, keys.get(row.item_id))));
}

interface ViewItemRow {
  readonly item_id: string;
  readonly short_id: string | null;
  readonly state: Selectable<MemoryTables['memory_items']>['state'];
  readonly is_pinned: number;
  readonly is_sensitive: number;
  readonly kind: 'fact' | 'self';
  readonly subject: ViewItem['subject'] | null;
  readonly version: number;
  readonly origin: ViewItem['origin'];
  readonly source: ViewItem['source'];
  readonly sealed: string;
  readonly changed_at: number;
  readonly created_at: number;
  readonly forgotten_at: number | null;
  readonly until: number | null;
}

async function openViewItem(
  row: ViewItemRow,
  key: CryptoKey | null | undefined,
): Promise<ViewItem> {
  const opened = await readViewText(key, {
    itemID: row.item_id,
    version: row.version,
    sealed: row.sealed,
  });

  return {
    itemID: row.item_id,
    shortID: getItemShortID(row),
    state: row.state,
    isPinned: row.is_pinned === 1,
    isSensitive: row.is_sensitive === 1,
    subject: getRowSubject(row),
    version: row.version,
    origin: row.origin,
    source: row.source,
    createdAt: row.created_at,
    changedAt: row.changed_at,
    forgottenAt: row.forgotten_at,
    until: row.until,
    ...opened.text,
  };
}
