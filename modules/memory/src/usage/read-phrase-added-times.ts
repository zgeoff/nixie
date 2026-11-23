import { readItemKeys } from '../item-key/read-item-keys';
import { itemLabelsCodec } from '../label/item-labels-codec';
import type { MemoryTables, StoreParts } from '../types';
import { buildTriggerKey } from '../utils/build-trigger-key';

// For each named item, the time each of its trigger phrases first appeared in a labels revision,
// by phrase key. A revision whose key was erased reads as nothing, so its phrases that no readable
// revision holds have no entry.
export async function readPhraseAddedTimes(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<ReadonlyMap<string, ReadonlyMap<string, number>>> {
  const db = parts.context.log.writer.db;

  const rows =
    itemIDs.length === 0
      ? []
      : await db
          .$extendTables<MemoryTables>()
          .selectFrom('memory_labels')
          .select(['item_id', 'revision', 'sealed', 'sequence', 'recorded_at'])
          .where('item_id', 'in', itemIDs)
          .orderBy('sequence')
          .execute();

  const keys = await readItemKeys(
    parts.context.log,
    rows.map((row) => ({ value: 'labels', itemID: row.item_id, sequence: row.sequence })),
    db,
  );

  const added = new Map<string, Map<string, number>>();

  for (const [index, row] of rows.entries()) {
    const key = keys[index];

    if (key?.status !== 'readable') {
      continue;
    }

    const labels = await itemLabelsCodec.decode(
      key.key,
      { itemID: row.item_id, revision: row.revision },
      row.sealed,
    );

    const times = added.get(row.item_id) ?? new Map<string, number>();

    for (const phrase of labels.triggers) {
      const phraseKey = buildTriggerKey(phrase);

      if (!times.has(phraseKey)) {
        times.set(phraseKey, row.recorded_at);
      }
    }

    added.set(row.item_id, times);
  }

  return added;
}
