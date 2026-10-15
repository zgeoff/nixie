import { withWriteTransaction } from '@heynixie/log';
import type { StoreParts, VersionRef } from './types';
import { updateVersionIndex } from './update-version-index';
import type { VersionPlan } from './write-version-in-transaction';
import { writeVersionInTransaction } from './write-version-in-transaction';

// What a caller beyond the store adds to a version plan: a new item's existing key, the notice, a
// check inside the transaction, and the approval the version consumes.
export type VersionExtras = Pick<
  VersionPlan,
  'newItemID' | 'noticeKey' | 'requireInTransaction' | 'approval'
>;

// Adds one version to an item, or creates the item with its key and first version, under the
// delivery lock. The stale-version check, the record and the item's row commit in one transaction,
// then the index takes the item's current text, or drops an item that left the active state.
export function writeMemoryVersion(parts: StoreParts, plan: VersionPlan): Promise<VersionRef> {
  return parts.lock(async () => {
    const written = await withWriteTransaction(parts.context.log.writer, (tx) =>
      writeVersionInTransaction(parts, tx, plan),
    );

    await updateVersionIndex(parts, written.ref.itemID, written.next);

    return written.ref;
  });
}
