import type { Kysely } from 'kysely';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { StaleVersionError } from './stale-version-error';
import type { MemoryItemRow, MemoryState, MemoryTables, VersionRef } from './types';

export interface ItemRequirement {
  readonly target: VersionRef;
  readonly operation: string;
  readonly states: readonly MemoryState[];
}

// Reads the target item and throws unless the caller may change it: the item exists and is not
// forgotten or being forgotten, it is still at the version the caller read, and its state allows
// the operation.
export async function requireItem(
  db: Kysely<MemoryTables>,
  requirement: ItemRequirement,
): Promise<MemoryItemRow> {
  const target = requirement.target;

  const item = await db
    .selectFrom('memory_items')
    .selectAll()
    .where('item_id', '=', target.itemID)
    .executeTakeFirst();

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    throw new MemoryItemNotFoundError(target.itemID);
  }

  if (item.version !== target.version) {
    throw new StaleVersionError(target, item.version);
  }

  if (!requirement.states.includes(item.state)) {
    throw new MemoryStateError(target.itemID, requirement.operation, item.state);
  }

  return item;
}
