import type { ContentSource } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readItemKeys } from '../item-key/read-item-keys';
import { itemLabelsCodec } from '../label/item-labels-codec';
import type { Labels, MemoryTables, StoreParts } from '../types';

export interface CurrentLabels {
  readonly labels: Labels;
  readonly source: ContentSource;
  readonly taskID: string | null;
  readonly proposalID: string | null;
  readonly model: string | null;
}

// The newest label record of the item holds its current labels. Null when the item has none, or
// when they do not open.
export async function readCurrentLabels(
  parts: Pick<StoreParts, 'context'>,
  db: Kysely<unknown>,
  itemID: string,
): Promise<CurrentLabels | null> {
  const [row] = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_labels')
    .selectAll()
    .where('item_id', '=', itemID)
    .orderBy('sequence', 'desc')
    .limit(1)
    .execute();

  if (row === undefined) {
    return null;
  }

  const [opened] = await readItemKeys(
    parts.context.log,
    [{ value: 'labels', itemID, sequence: row.sequence }],
    db,
  );

  if (opened?.status !== 'readable') {
    return null;
  }

  try {
    const labels = await itemLabelsCodec.decode(
      opened.key,
      { itemID, revision: row.revision },
      row.sealed,
    );

    return {
      labels,
      source: row.source,
      taskID: row.task_id,
      proposalID: row.proposal_id,
      model: row.model,
    };
  } catch {
    return null;
  }
}
