import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readRemovedSequences } from '../record/read-removed-sequences';
import type { MemoryTables } from '../types';
import type { ItemValueRef } from './types';

export interface ItemKeyRow {
  readonly key_id: string;
  readonly item_id: string;
  readonly kind: 'generation' | 'version';
  readonly version: number | null;
  readonly sealed_evidence_quote: string | null;
  readonly sealed_intent_quote: string | null;
  readonly from_sequence: number;
  readonly removed_sequence: number | null;
}

export interface ItemKeyFacts {
  readonly keyRows: ReadonlyMap<string, readonly ItemKeyRow[]>;

  // the item's current text version and label revision
  readonly items: ReadonlyMap<string, { readonly version: number; readonly revision: number }>;

  // the items with a purge that has no memory.evidence_purged yet
  readonly purging: ReadonlySet<string>;

  // the revision of each memory.labelled record, by sequence
  readonly labelRevisions: ReadonlyMap<number, number>;

  // the key ID of each quoted record, by sequence; null when the record has none
  readonly quotedKeyIDs: ReadonlyMap<number, string | null>;

  // the quoted records that a record forget began on
  readonly forgettingSequences: ReadonlySet<number>;
}

// Reads every fact that decides whether a value reads as removed, in plain columns and with no
// key. The lookup reads them twice, around the key reads.
export async function readItemKeyFacts(
  db: Kysely<unknown>,
  refs: readonly ItemValueRef[],
): Promise<ItemKeyFacts> {
  const tables = db.$extendTables<MemoryTables>();
  const itemIDs = [...new Set(refs.map((ref) => ref.itemID))];
  const labelSequences = collectSequences(refs, 'labels');

  const quoteSequences = [
    ...new Set(refs.flatMap((ref) => (ref.value === 'version-quote' ? [ref.recordSequence] : []))),
  ];

  const [keyRows, items, purges, labels, quoted, forgetting] = await Promise.all([
    itemIDs.length === 0
      ? []
      : tables.selectFrom('memory_item_keys').selectAll().where('item_id', 'in', itemIDs).execute(),
    itemIDs.length === 0
      ? []
      : tables
          .selectFrom('memory_items')
          .select(['item_id', 'version', 'label_edits'])
          .where('item_id', 'in', itemIDs)
          .execute(),
    itemIDs.length === 0
      ? []
      : tables
          .selectFrom('memory_evidence_purges')
          .select('item_id')
          .where('item_id', 'in', itemIDs)
          .where('purged_sequence', 'is', null)
          .execute(),
    labelSequences.length === 0
      ? []
      : tables
          .selectFrom('memory_labels')
          .select(['sequence', 'revision'])
          .where('sequence', 'in', labelSequences)
          .execute(),
    quoteSequences.length === 0
      ? []
      : db
          .$extendTables<LogTables>()
          .selectFrom('records')
          .select(['sequence', 'key_id'])
          .where('sequence', 'in', quoteSequences)
          .execute(),
    readRemovedSequences(db, quoteSequences),
  ]);

  const rowsByItem = new Map<string, ItemKeyRow[]>();

  for (const row of keyRows) {
    rowsByItem.set(row.item_id, [...(rowsByItem.get(row.item_id) ?? []), row]);
  }

  return {
    keyRows: rowsByItem,
    items: new Map(
      items.map((item) => [
        item.item_id,
        { version: item.version, revision: item.version + item.label_edits },
      ]),
    ),
    purging: new Set(purges.map((row) => row.item_id)),
    labelRevisions: new Map(labels.map((row) => [row.sequence, row.revision])),
    quotedKeyIDs: new Map(quoted.map((row) => [row.sequence, row.key_id])),
    forgettingSequences: forgetting,
  };
}

function collectSequences(refs: readonly ItemValueRef[], value: 'labels'): readonly number[] {
  return [...new Set(refs.flatMap((ref) => (ref.value === value ? [ref.sequence] : [])))];
}
