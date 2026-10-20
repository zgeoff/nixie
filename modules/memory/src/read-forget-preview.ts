import type { Log } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readEvidenceSequences } from './read-evidence-sequences';
import { readItemDetail } from './read-item-detail';
import { requireItem } from './require-item';
import type { MemoryTables, VersionRef } from './types';
import type { ForgetPreview } from './view-types';

// Reads what a forget of the item at the version the view showed destroys: the item with every
// version, the messages that backed it and its proposals. It refuses as the forget does, so a
// confirmation never opens for an item that is gone, moved on or being forgotten.
export async function readForgetPreview(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  target: VersionRef,
): Promise<ForgetPreview> {
  const db = log.writer.db.$extendTables<MemoryTables>();

  await requireItem(db, { target, operation: 'forget', states: ['active', 'retired'] });

  const [detail, evidenceSequences, proposals] = await Promise.all([
    readItemDetail(log, target.itemID),
    readEvidenceSequences(db, target.itemID),
    db
      .selectFrom('memory_proposals')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('item_id', '=', target.itemID)
      .executeTakeFirstOrThrow(),
  ]);

  // requireItem found the item, and no read deletes its row
  invariant(detail);

  return {
    ...detail,
    lost: { evidenceMessages: evidenceSequences.length, proposals: proposals.count },
  };
}
