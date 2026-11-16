import { withWriteTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import type { MemoryItemRow, MemoryTables, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { readVersion } from '../version/read-version';
import { buildDerivedLabels } from './build-derived-labels';
import { writeLabelsInTransaction } from './write-labels-in-transaction';

const batchSize = 100;

// Labels each active or retired item that has no label record. It writes no marker: the lack of a
// record is the query, so a second run writes nothing.
export async function runLabelBackfill(parts: StoreParts): Promise<void> {
  const log = parts.context.log;

  for (;;) {
    const unlabelled = await readUnlabelledItems(log.writer.db.$extendTables<MemoryTables>());

    if (unlabelled.length === 0) {
      return;
    }

    const currents = await Promise.all(
      unlabelled.map((item) => readCurrentItemKey(log, item.item_id)),
    );

    const readable = unlabelled.filter((_, index) => currents[index]?.status === 'readable');

    if (readable.length === 0) {
      return;
    }

    await withWriteTransaction(log.writer, async (tx) => {
      for (const item of readable) {
        const labelKey = await readCurrentItemKey(log, item.item_id, tx);

        if (labelKey.status !== 'readable') {
          continue;
        }

        const current = await readVersion(log, tx, { itemID: item.item_id, version: item.version });

        await writeLabelsInTransaction(parts, tx, {
          itemID: item.item_id,
          key: labelKey.key,
          revision: item.version + item.label_edits,
          version: item.version,
          change: 'backfilled',
          labels: buildDerivedLabels(current.text.text, getRowSubject(item)),
          origin: 'migration',
          source: current.row.source,
          taskID: null,
          proposalID: null,
          model: null,
        });
      }
    });

    if (readable.length < batchSize) {
      return;
    }
  }
}

function readUnlabelledItems(db: Kysely<MemoryTables>): Promise<readonly MemoryItemRow[]> {
  return db
    .selectFrom('memory_items')
    .selectAll()
    .where('state', 'in', ['active', 'retired'])
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('memory_labels')
            .select('memory_labels.item_id')
            .whereRef('memory_labels.item_id', '=', 'memory_items.item_id'),
        ),
      ),
    )
    .orderBy('created_sequence')
    .limit(batchSize)
    .execute();
}
