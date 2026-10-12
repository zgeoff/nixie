import { withWriteTransaction } from '@heynixie/log';
import type { StoreParts, VersionRef } from './types';
import { updateVersionIndex } from './update-version-index';
import type { VersionPlan } from './write-version-in-transaction';
import { writeVersionInTransaction } from './write-version-in-transaction';

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
