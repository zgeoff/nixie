import type { Log } from '@heynixie/log';
import type { Selectable } from 'kysely';
import type { MemoryTables } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { getItemShortID } from '../utils/item/get-item-short-id';
import type { ViewItem } from './memory-view';
import type { OpenedVersion } from './read-view-texts';
import { readViewTexts } from './read-view-texts';

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
      'item.kind',
      'item.subject',
      'item.version',
      'item.label_edits',
      'item.until',
      'current.origin',
      'current.source',
      'current.sealed',
      'current.sequence',
      'current.evidence',
      'current.intent_evidence',
      'current.recorded_at as changed_at',
      'first.recorded_at as created_at',
      'forgotten.recorded_at as forgotten_at',
    ])
    .where('item.item_id', 'in', itemIDs)
    .execute();

  const byID = new Map(rows.map((row) => [row.item_id, row]));

  const found = itemIDs.flatMap((itemID) => byID.get(itemID) ?? []);

  const opened = await readViewTexts(log, log.writer.db, found);

  return found.map((row, index) => buildViewItem(row, opened[index]));
}

interface ViewItemRow {
  readonly item_id: string;
  readonly short_id: string | null;
  readonly state: Selectable<MemoryTables['memory_items']>['state'];
  readonly is_pinned: number;
  readonly kind: 'fact' | 'self';
  readonly subject: ViewItem['subject'] | null;
  readonly version: number;
  readonly label_edits: number;
  readonly origin: ViewItem['origin'];
  readonly source: ViewItem['source'];
  readonly sealed: string;
  readonly sequence: number;
  readonly evidence: string | null;
  readonly intent_evidence: string | null;
  readonly changed_at: number;
  readonly created_at: number;
  readonly forgotten_at: number | null;
  readonly until: number | null;
}

function buildViewItem(row: ViewItemRow, opened: OpenedVersion | undefined): ViewItem {
  return {
    itemID: row.item_id,
    shortID: getItemShortID(row),
    state: row.state,
    isPinned: row.is_pinned === 1,
    subject: getRowSubject(row),
    version: row.version + row.label_edits,
    origin: row.origin,
    source: row.source,
    createdAt: row.created_at,
    changedAt: row.changed_at,
    forgottenAt: row.forgotten_at,
    until: row.until,
    ...(opened?.text ?? { status: 'unreadable' }),
  };
}
