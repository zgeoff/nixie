import { withWriteTransaction } from '@heynixie/log';
import type { StoreParts, VersionRef } from '../types';
import { updateVersionIndex } from '../version/update-version-index';
import type { VersionPlan } from '../version/write-version-in-transaction';
import { writeVersionInTransaction } from '../version/write-version-in-transaction';

export type VersionExtras = Pick<
  VersionPlan,
  'newItemID' | 'noticeKey' | 'requireInTransaction' | 'writeInTransaction' | 'approval'
>;

export function writeMemoryVersion(parts: StoreParts, plan: VersionPlan): Promise<VersionRef> {
  return parts.lock(async () => {
    const written = await withWriteTransaction(parts.context.log.writer, (tx) =>
      writeVersionInTransaction(parts, tx, plan),
    );

    await updateVersionIndex(parts, written.ref.itemID, written.next);

    return written.ref;
  });
}
