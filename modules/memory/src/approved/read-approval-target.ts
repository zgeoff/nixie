import type { MemoryProposalRow } from '../gate/gate-context';
import type { MemoryTables, StoreParts, VersionRef } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { StaleVersionError } from '../utils/error/stale-version-error';

// The proposal's target as the item's current number: the revision the labelled proposal read, or,
// for a proposal with no label record, the item's revision once its text version still matches.
// The write then checks the number again inside its own transaction.
export async function readApprovalTarget(
  parts: Pick<StoreParts, 'context'>,
  row: MemoryProposalRow,
): Promise<VersionRef> {
  const item = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['version', 'label_edits'])
    .where('item_id', '=', row.item_id)
    .executeTakeFirst();

  if (item === undefined) {
    throw new MemoryItemNotFoundError(row.item_id);
  }

  const revision = item.version + item.label_edits;

  if (row.sealed_labels !== null) {
    return { itemID: row.item_id, version: row.target_revision ?? revision };
  }

  const textVersion = row.target_version ?? item.version;

  if (textVersion !== item.version) {
    throw new StaleVersionError({ itemID: row.item_id, version: textVersion }, revision);
  }

  return { itemID: row.item_id, version: revision };
}
