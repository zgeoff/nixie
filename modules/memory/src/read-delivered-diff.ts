import type { ConsolidationDiff } from './consolidation-types';
import { readPendingDiff } from './read-pending-diff';
import type { MemoryTables, StoreParts } from './types';

// Reads the pending diff for the model under the delivery lock that recall takes, so a forget
// either starts after the read or before it. A change with an input that is forgetting or forgotten
// drops out whole, because a merged or rewritten text can hold that input's words.
export function readDeliveredDiff(parts: StoreParts): Promise<ConsolidationDiff | null> {
  return parts.lock(async () => {
    const diff = await readPendingDiff(parts);

    if (diff === null) {
      return null;
    }
    const gone = await readForgottenItemIDs(
      parts,
      diff.changes.flatMap((change) => change.inputs.map((input) => input.itemID)),
    );
    const changes = diff.changes.filter((change) =>
      change.inputs.every((input) => !gone.has(input.itemID)),
    );

    return changes.length === 0 ? null : { ...diff, changes };
  });
}

// the items among those given that a forget has begun on
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
