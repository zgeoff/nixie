import type { ConsolidationDiff } from './consolidation-types';
import { readPendingDiff } from './read-pending-diff';
import type { MemoryTables, StoreParts } from './types';

export function readDeliveredDiff(parts: StoreParts): Promise<ConsolidationDiff | null> {
  return parts.lock(async () => {
    const diff = await readPendingDiff(parts);

    if (diff === null) {
      return null;
    }

    const gone = await readForgottenItemIDs(parts, [
      ...diff.changes.flatMap((change) => change.inputs.map((input) => input.itemID)),
      ...(diff.summary?.itemIDs ?? []),
    ]);

    const changes = diff.changes.filter((change) =>
      change.inputs.every((input) => !gone.has(input.itemID)),
    );

    const isSummaryGone =
      diff.summary !== null && diff.summary.itemIDs.some((itemID) => gone.has(itemID));

    const summary = isSummaryGone ? null : diff.summary;

    return changes.length === 0 && summary === null ? null : { ...diff, changes, summary };
  });
}

async function readForgottenItemIDs(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  if (itemIDs.length === 0) {
    return new Set();
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('item_id', 'in', itemIDs)
    .where('state', 'in', ['forgetting', 'forgotten'])
    .execute();

  return new Set(rows.map((row) => row.item_id));
}
