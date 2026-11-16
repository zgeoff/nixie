import type { Kysely } from 'kysely';
import type { MemoryItemRow, MemoryState, MemoryTables, VersionRef } from '../../types';
import { MemoryItemNotFoundError } from '../error/memory-item-not-found-error';
import { MemoryStateError } from '../error/memory-state-error';
import { StaleVersionError } from '../error/stale-version-error';

export interface ItemRequirement {
  readonly target: VersionRef;
  readonly operation: string;
  readonly states: readonly MemoryState[];
}

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

  const revision = item.version + item.label_edits;

  if (revision !== target.version) {
    throw new StaleVersionError(target, revision);
  }

  if (!requirement.states.includes(item.state)) {
    throw new MemoryStateError(target.itemID, requirement.operation, item.state);
  }

  return item;
}
